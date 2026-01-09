import express from 'express';
import { query } from '../db';
import bcrypt from 'bcryptjs';

const router = express.Router();

// Create employee
router.post('/create', async (req, res) => {
  try {
    const {
      username,
      password,
      full_name,
      full_name_ar,
      email,
      phone,
      role,
      tenant_id,
      service_shift_assignments,
    } = req.body;

    if (!username || !password || !full_name || !tenant_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate role
    if (!['employee', 'receptionist', 'cashier'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be employee, receptionist, or cashier' });
    }

    // Check if username or email already exists
    const existingUser = await query(
      `SELECT id FROM users WHERE username = $1 OR email = $2`,
      [username, email || '']
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user in database directly (no Supabase Auth dependency)
    const emailForUser = email || `${username}@bookati.local`;
    const userResult = await query(
      `INSERT INTO users (id, username, email, phone, full_name, full_name_ar, role, tenant_id, password_hash, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true)
       RETURNING *`,
      [
        username,
        emailForUser,
        phone || null,
        full_name,
        full_name_ar || '',
        role || 'employee',
        tenant_id,
        passwordHash,
      ]
    );

    const newUser = userResult.rows[0];

    // Create employee service assignments (only for employees, not receptionists/cashiers)
    if (role === 'employee' && service_shift_assignments && service_shift_assignments.length > 0) {
      const assignments: any[] = [];
      service_shift_assignments.forEach((serviceAssignment: any) => {
        if (serviceAssignment.shiftIds && serviceAssignment.shiftIds.length > 0) {
          serviceAssignment.shiftIds.forEach((shift_id: string) => {
            assignments.push({
              employee_id: newUser.id,
              service_id: serviceAssignment.serviceId,
              shift_id,
              tenant_id,
              duration_minutes: serviceAssignment.durationMinutes || null,
              capacity_per_slot: serviceAssignment.capacityPerSlot || 1,
            });
          });
        }
      });

      if (assignments.length > 0) {
        for (const assignment of assignments) {
          await query(
            `INSERT INTO employee_services (id, employee_id, service_id, shift_id, tenant_id, duration_minutes, capacity_per_slot)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
             ON CONFLICT (employee_id, service_id, shift_id) DO NOTHING`,
            [
              assignment.employee_id,
              assignment.service_id,
              assignment.shift_id,
              assignment.tenant_id,
              assignment.duration_minutes,
              assignment.capacity_per_slot,
            ]
          );
        }
      }
    }

    res.json({ user: newUser });
  } catch (error: any) {
    console.error('Create employee error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Update employee
router.post('/update', async (req, res) => {
  try {
    const {
      employee_id,
      username,
      password,
      full_name,
      full_name_ar,
      phone,
      role,
      is_active,
    } = req.body;

    if (!employee_id) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    // Get existing employee
    const existingResult = await query('SELECT * FROM users WHERE id = $1', [employee_id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const existing = existingResult.rows[0];

    // Update password if provided
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, employee_id]
      );
    }

    // Update database fields
    const updates: any = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (full_name_ar !== undefined) updates.full_name_ar = full_name_ar;
    if (phone !== undefined) updates.phone = phone;
    if (role !== undefined) {
      if (!['employee', 'receptionist', 'cashier'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be employee, receptionist, or cashier' });
      }
      updates.role = role;
    }
    if (is_active !== undefined) updates.is_active = is_active;
    if (username !== undefined && username !== existing.username) {
      // Check if new username already exists
      const usernameCheck = await query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, employee_id]
      );
      if (usernameCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      updates.username = username;
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 1}`).join(', ');
      const values = Object.values(updates);
      values.push(employee_id);

      await query(
        `UPDATE users SET ${setClauses} WHERE id = $${values.length}`,
        values
      );
    }

    res.json({ success: true, message: 'Employee updated successfully' });
  } catch (error: any) {
    console.error('Update employee error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export { router as employeeRoutes };

