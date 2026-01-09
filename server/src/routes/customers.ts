import express from 'express';
import { query } from '../db';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to authenticate customer
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Access denied. Customer role required.' });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      tenant_id: decoded.tenant_id,
    };
    
    next();
  } catch (error: any) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Get customer's bookings
router.get('/bookings', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await query(
      `SELECT 
        b.id,
        b.service_id,
        s.name as service_name,
        s.name_ar as service_name_ar,
        sl.slot_date,
        sl.start_time,
        sl.end_time,
        b.status,
        b.total_price,
        b.visitor_count,
        b.notes,
        b.created_at,
        r.id as review_id,
        r.rating,
        r.is_approved as review_approved
      FROM bookings b
      INNER JOIN services s ON b.service_id = s.id
      INNER JOIN slots sl ON b.slot_id = sl.id
      LEFT JOIN reviews r ON r.booking_id = b.id AND r.customer_id = $1
      WHERE b.customer_id = $1
      ORDER BY sl.slot_date DESC, sl.start_time DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching customer bookings:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get customer profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await query(
      `SELECT 
        id,
        email,
        username,
        full_name,
        full_name_ar,
        phone,
        role,
        tenant_id,
        created_at
      FROM users
      WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching customer profile:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update customer profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { full_name, full_name_ar, phone } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (full_name !== undefined) {
      updates.push(`full_name = $${paramCount++}`);
      values.push(full_name);
    }

    if (full_name_ar !== undefined) {
      updates.push(`full_name_ar = $${paramCount++}`);
      values.push(full_name_ar);
    }

    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    const queryText = `
      UPDATE users 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING id, email, username, full_name, full_name_ar, phone, role, tenant_id
    `;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error updating customer profile:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get customer's invoices with pagination, search, and lazy loading support
router.get('/invoices', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    // Extract query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    // Build search condition
    let searchCondition = '';
    let searchParams: any[] = [userId];
    
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      const paramIndex = searchParams.length + 1;
      searchCondition = `AND (
        s.name ILIKE $${paramIndex} OR 
        s.name_ar ILIKE $${paramIndex} OR
        b.zoho_invoice_id ILIKE $${paramIndex} OR
        b.customer_name ILIKE $${paramIndex}
      )`;
      searchParams.push(searchPattern);
    }

    // Get total count for pagination
    // Use LEFT JOINs to match the data query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN slots sl ON b.slot_id = sl.id
      WHERE b.customer_id = $1
        AND b.zoho_invoice_id IS NOT NULL
        ${searchCondition}
    `;
    
    const countResult = await query(countQuery, searchParams);
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Get paginated results
    // Use COALESCE to handle NULL zoho_invoice_created_at values
    // Order by the most recent timestamp (either invoice creation or booking creation)
    // Use LEFT JOINs to ensure invoices aren't excluded if service/slot data is missing
    const dataQuery = `
      SELECT 
        b.id,
        b.zoho_invoice_id,
        b.zoho_invoice_created_at,
        b.total_price,
        b.status,
        b.payment_status,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.created_at,
        COALESCE(s.name, 'Unknown Service') as service_name,
        COALESCE(s.name_ar, '') as service_name_ar,
        sl.slot_date,
        sl.start_time,
        sl.end_time
      FROM bookings b
      LEFT JOIN services s ON b.service_id = s.id
      LEFT JOIN slots sl ON b.slot_id = sl.id
      WHERE b.customer_id = $1
        AND b.zoho_invoice_id IS NOT NULL
        ${searchCondition}
      ORDER BY 
        COALESCE(b.zoho_invoice_created_at, b.created_at) DESC NULLS LAST,
        b.created_at DESC
      LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}
    `;
    
    const dataParams = [...searchParams, limit, offset];
    const result = await query(dataQuery, dataParams);

    // Log for debugging
    console.log(`[Customer Invoices API] Customer: ${userId}, Page: ${page}, Limit: ${limit}, Total: ${total}, Results: ${result.rows.length}`);
    if (result.rows.length > 0) {
      const firstDate = result.rows[0].zoho_invoice_created_at || result.rows[0].created_at;
      const lastDate = result.rows[result.rows.length - 1].zoho_invoice_created_at || result.rows[result.rows.length - 1].created_at;
      console.log(`[Customer Invoices API] Date range: ${new Date(firstDate).toLocaleString()} to ${new Date(lastDate).toLocaleString()}`);
    }

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error('Error fetching customer invoices:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Get latest invoice timestamp for a customer (for diagnostic purposes)
router.get('/invoices/latest', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await query(
      `SELECT 
        b.zoho_invoice_id,
        COALESCE(b.zoho_invoice_created_at, b.created_at) as timestamp
      FROM bookings b
      WHERE b.customer_id = $1
        AND b.zoho_invoice_id IS NOT NULL
      ORDER BY COALESCE(b.zoho_invoice_created_at, b.created_at) DESC
      LIMIT 1`,
      [userId]
    );

    if (result.rows.length > 0) {
      res.json({
        invoice_id: result.rows[0].zoho_invoice_id,
        timestamp: result.rows[0].timestamp,
      });
    } else {
      res.json({
        invoice_id: null,
        timestamp: null,
      });
    }
  } catch (error: any) {
    console.error('Error fetching latest invoice:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export { router as customerRoutes };



