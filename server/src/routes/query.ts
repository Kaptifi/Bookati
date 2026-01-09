import express from 'express';
import { query } from '../db';

const router = express.Router();

// Generic query endpoint
router.get('/query', async (req, res) => {
  try {
    const { table, select = '*', where, orderBy, limit } = req.query;

    if (!table) {
      return res.status(400).json({ error: 'Table name is required' });
    }

    // Handle complex select with joins (e.g., "*, services (name, name_ar)")
    // For now, we'll parse basic selects and handle joins separately
    let sql = '';
    const params: any[] = [];
    let paramIndex = 1;

    // Parse select to handle Supabase-style nested selects
    // Clean up the select string (remove newlines, extra spaces, but preserve structure)
    let cleanSelect = (select as string).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    // Remove leading/trailing commas and spaces
    cleanSelect = cleanSelect.replace(/^,+|,+$/g, '').trim();
    
    // Split by comma, but be careful with nested parentheses
    const selectParts: string[] = [];
    let currentPart = '';
    let depth = 0;
    
    for (let i = 0; i < cleanSelect.length; i++) {
      const char = cleanSelect[i];
      if (char === '(') depth++;
      if (char === ')') depth--;
      
      if (char === ',' && depth === 0) {
        if (currentPart.trim()) {
          selectParts.push(currentPart.trim());
        }
        currentPart = '';
      } else {
        currentPart += char;
      }
    }
    if (currentPart.trim()) {
      selectParts.push(currentPart.trim());
    }
    
    const mainSelects: string[] = [];
    const joins: Array<{ table: string; alias: string; columns: string[]; on: string; isOneToMany?: boolean; parentTable?: string }> = [];

    selectParts.forEach(part => {
      const trimmedPart = part.trim();
      
      if (!trimmedPart) return; // Skip empty parts
      
      if (trimmedPart.includes('(') && trimmedPart.includes(')')) {
        // Handle nested relation: "services (name, name_ar)" or "employee_services(service_id, services(name, name_ar))"
        // Support both formats: "table (cols)" and "table:foreign_key (cols)"
        // Also support nested: "employee_services(service_id, services(name, name_ar))"
        
        // Check for nested relations like "employee_services(...services(name, name_ar)...)"
        // Match pattern: table_name(...columns..., nested_table(nested_columns))
        // First, try to find nested relation pattern within the parentheses
        const nestedRelationMatch = trimmedPart.match(/^(\w+)\s*\((.+)\)$/);
        if (nestedRelationMatch) {
          const parentTable = nestedRelationMatch[1]; // employee_services
          const fullContent = nestedRelationMatch[2]; // service_id, shift_id, services(name, name_ar)
          
          // Extract nested relation: find pattern like "services(name, name_ar)"
          // Use a more robust approach: find the last occurrence of "table_name(...)"
          const nestedMatch = fullContent.match(/(\w+)\s*\(([^)]+)\)\s*$/);
          if (nestedMatch) {
            const childTable = nestedMatch[1]; // services
            const childColumns = nestedMatch[2].split(',').map(c => c.trim()).filter(c => c);
            
            // Extract parent columns (everything before the nested relation)
            const beforeNested = fullContent.substring(0, fullContent.lastIndexOf(nestedMatch[0])).trim();
            const parentColumns = beforeNested ? beforeNested.split(',').map(c => c.trim()).filter(c => c) : [];
            
            // Always include id for parent if not already present
            if (!parentColumns.includes('id')) {
              parentColumns.unshift('id');
            }
            
            // First join: parent table (employee_services) to main table (users)
            const parentAlias = `${parentTable}_rel`;
            let parentForeignKey: string;
            
            if (parentTable === 'employee_services') {
              parentForeignKey = 'employee_id';
            } else {
              // Default pattern
              const singular = parentTable.replace(/s$/, '');
              parentForeignKey = `${singular}_id`;
            }
            
            // Second join: child table (services) to parent table (employee_services)
            const childAlias = `${childTable}_rel`;
            let childForeignKey: string;
            
            if (childTable === 'services') {
              childForeignKey = 'service_id';
            } else {
              const singular = childTable.replace(/s$/, '');
              childForeignKey = `${singular}_id`;
            }
            
            // Add parent join (one-to-many relation, so we'll group results)
            joins.push({
              table: parentTable,
              alias: parentAlias,
              columns: parentColumns.length > 0 ? parentColumns : ['id', 'service_id', 'shift_id', 'duration_minutes', 'capacity_per_slot'],
              on: `${table}.id = ${parentAlias}.${parentForeignKey}`,
              isOneToMany: true, // Mark as one-to-many
            });
            
            // Add child join (nested relation)
            joins.push({
              table: childTable,
              alias: childAlias,
              columns: childColumns,
              on: `${parentAlias}.${childForeignKey} = ${childAlias}.id`,
              parentTable: parentTable, // Track parent for nesting
            });
            
            return; // Skip to next part
          }
        }
        
        // Handle simple relation: "services (name, name_ar)" or "services:service_id (id, name)"
        let relationTable: string;
        let foreignKey: string | null = null;
        
        if (trimmedPart.includes(':')) {
          // Format: "services:service_id (id, name, name_ar)"
          const colonMatch = trimmedPart.match(/(\w+):(\w+)\s*\(([^)]+)\)/);
          if (colonMatch) {
            relationTable = colonMatch[1];
            foreignKey = colonMatch[2];
            const relationColumns = colonMatch[3].split(',').map(c => c.trim()).filter(c => c);
            const alias = `${relationTable}_rel`;
            
            if (relationColumns.length > 0) {
              joins.push({
                table: relationTable,
                alias,
                columns: relationColumns,
                on: `${table}.${foreignKey} = ${alias}.id`,
              });
            }
          } else {
            console.warn(`[Query] Failed to parse relation with colon: ${trimmedPart}`);
          }
        } else {
          // Format: "services (name, name_ar)" or "service_categories (id, name)"
          const match = trimmedPart.match(/(\w+)\s*\(([^)]+)\)/);
          if (match) {
            relationTable = match[1];
            const relationColumns = match[2].split(',').map(c => c.trim()).filter(c => c);
            const alias = `${relationTable}_rel`;
            
            if (relationColumns.length > 0) {
              // Determine foreign key column name
              // For join tables like employee_services, the relationship is:
              // - main_table.id = join_table.foreign_key (e.g., users.id = employee_services.employee_id)
              // For regular relations, it's:
              // - main_table.foreign_key = relation_table.id (e.g., services.category_id = service_categories.id)
              
              let joinCondition: string;
              
              // Check if this is a join table (many-to-many or one-to-many through join table)
              if (relationTable === 'employee_services') {
                // employee_services is a join table: users.id = employee_services.employee_id
                joinCondition = `${table}.id = ${alias}.employee_id`;
              } else if (relationTable === 'package_services' && table !== 'package_services') {
                // package_services is a join table when querying FROM another table
                // e.g., service_packages.id = package_services.package_id
                joinCondition = `${table}.id = ${alias}.package_id`;
              } else if (relationTable === 'service_offers') {
                // service_offers is a join table
                joinCondition = `${table}.id = ${alias}.service_id`;
              } else {
                // Regular relation: determine foreign key column in main table
                let foreignKeyColumn: string;
                
                if (relationTable === 'service_categories') {
                  foreignKeyColumn = 'category_id';
                } else if (relationTable === 'customers') {
                  foreignKeyColumn = 'customer_id';
                } else if (relationTable === 'service_packages') {
                  foreignKeyColumn = 'package_id';
                } else if (relationTable === 'services') {
                  // For services table, the foreign key is service_id (singular)
                  foreignKeyColumn = 'service_id';
                } else {
                  // Default: try {singular}_id pattern
                  const singular = relationTable.replace(/s$/, '');
                  foreignKeyColumn = `${singular}_id`;
                }
                
                joinCondition = `${table}.${foreignKeyColumn} = ${alias}.id`;
              }
              
              joins.push({
                table: relationTable,
                alias,
                columns: relationColumns,
                on: joinCondition,
              });
            }
          } else {
            console.warn(`[Query] Failed to parse relation: ${trimmedPart}`);
          }
        }
      } else if (trimmedPart === '*') {
        mainSelects.push(`${table}.*`);
      } else {
        // Regular column - make sure it doesn't contain colons (which would be invalid)
        if (trimmedPart.includes(':')) {
          console.warn(`[Query] Skipping invalid column with colon: ${trimmedPart}`);
        } else {
          mainSelects.push(`${table}.${trimmedPart}`);
        }
      }
    });

    // Build SELECT clause
    const selectColumns = [...mainSelects];
    
    // Debug logging
    console.log('[Query] Main selects:', mainSelects);
    console.log('[Query] Joins:', joins.map(j => ({ table: j.table, alias: j.alias, columns: j.columns })));
    
    joins.forEach(join => {
      if (!join.alias || !join.table || !join.columns || join.columns.length === 0) {
        console.warn(`[Query] Invalid join configuration:`, join);
        return;
      }
      join.columns.forEach(col => {
        if (col && col.trim()) {
          // Escape column names and alias to prevent SQL injection
          const safeAlias = join.alias.replace(/[^a-zA-Z0-9_]/g, '');
          const safeTable = join.table.replace(/[^a-zA-Z0-9_]/g, '');
          const safeCol = col.trim().replace(/[^a-zA-Z0-9_]/g, '');
          
          if (!safeAlias || !safeTable || !safeCol) {
            console.warn(`[Query] Invalid column/alias/table after sanitization:`, { alias: join.alias, table: join.table, col });
            return;
          }
          
          // For nested relations, use the actual alias, not the table name
          // The alias is already unique (e.g., services_rel, employee_services_rel)
          const selectExpr = `${safeAlias}.${safeCol} AS ${safeAlias}_${safeCol}`;
          selectColumns.push(selectExpr);
        }
      });
    });
    
    console.log('[Query] Final select columns:', selectColumns);

    // Ensure we have at least one column
    if (selectColumns.length === 0) {
      selectColumns.push(`${table}.*`);
    }

    // Validate selectColumns before building SQL
    const validSelectColumns = selectColumns.filter(col => col && col.trim() && !col.includes('undefined') && !col.includes('null'));
    
    if (validSelectColumns.length === 0) {
      return res.status(400).json({ error: 'No valid columns to select' });
    }

    sql = `SELECT ${validSelectColumns.join(', ')} FROM ${table}`;

    // Add JOINs
    joins.forEach(join => {
      if (join.table && join.alias && join.on) {
        // Escape table and alias names to prevent SQL injection
        const safeTable = join.table.replace(/[^a-zA-Z0-9_]/g, '');
        const safeAlias = join.alias.replace(/[^a-zA-Z0-9_]/g, '');
        sql += ` LEFT JOIN ${safeTable} AS ${safeAlias} ON ${join.on}`;
      }
    });

    // Build WHERE clause
    if (where) {
      const conditions = JSON.parse(where as string);
      const whereClauses: string[] = [];
      
      Object.entries(conditions).forEach(([key, value]) => {
        if (key.endsWith('__neq')) {
          const column = key.replace('__neq', '');
          whereClauses.push(`${table}.${column} != $${paramIndex}`);
          params.push(value);
        } else if (key.endsWith('__in')) {
          const column = key.replace('__in', '');
          whereClauses.push(`${table}.${column} = ANY($${paramIndex})`);
          params.push(value);
        } else if (key.endsWith('__gt')) {
          const column = key.replace('__gt', '');
          whereClauses.push(`${table}.${column} > $${paramIndex}`);
          params.push(value);
        } else if (key.endsWith('__gte')) {
          const column = key.replace('__gte', '');
          whereClauses.push(`${table}.${column} >= $${paramIndex}`);
          params.push(value);
        } else if (key.endsWith('__lt')) {
          const column = key.replace('__lt', '');
          whereClauses.push(`${table}.${column} < $${paramIndex}`);
          params.push(value);
        } else if (key.endsWith('__lte')) {
          const column = key.replace('__lte', '');
          whereClauses.push(`${table}.${column} <= $${paramIndex}`);
          params.push(value);
        } else if (Array.isArray(value)) {
          whereClauses.push(`${table}.${key} = ANY($${paramIndex})`);
          params.push(value);
        } else {
          whereClauses.push(`${table}.${key} = $${paramIndex}`);
          params.push(value);
        }
        paramIndex++;
      });

      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
    }

    // Build ORDER BY clause
    if (orderBy) {
      const order = JSON.parse(orderBy as string);
      sql += ` ORDER BY ${table}.${order.column} ${order.ascending !== false ? 'ASC' : 'DESC'}`;
    }

    // Build LIMIT clause
    if (limit) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit as string));
    }

    // Log the SQL for debugging (remove in production)
    console.log('[Query] Generated SQL:', sql);
    console.log('[Query] Params:', params);
    
    const result = await query(sql, params);
    
    // Transform result to match Supabase format with nested relations
    // Group rows by main table ID to handle one-to-many relations
    const rowMap = new Map<string, any>();
    
    // Identify one-to-many joins (joins where main table.id = join_table.foreign_key)
    const oneToManyJoins = joins.filter(join => {
      // Check if join condition indicates one-to-many (main.id = join.foreign_key)
      return join.on.includes(`${table}.id`) && join.on.includes(`${join.alias}.`);
    });
    
    // Special handling: if querying from a join table like package_services,
    // don't group by ID - return each row separately
    const isJoinTableQuery = table === 'package_services' || table === 'employee_services';
    
    result.rows.forEach((row: any) => {
      const mainRowId = isJoinTableQuery ? `${row.id}_${Date.now()}_${Math.random()}` : row.id;
      
      if (!rowMap.has(mainRowId) || isJoinTableQuery) {
        // Initialize main row
        const mainRow: any = {};
        const relations: Record<string, any> = {};
        const arrayRelations: Record<string, Map<string, any>> = {}; // Use Map to track by relation ID

        // Extract main table columns
        Object.keys(row).forEach(key => {
          let isJoinColumn = false;
          
          for (const join of joins) {
            // Use alias instead of table name for column detection
            if (key.startsWith(`${join.alias}_`)) {
              isJoinColumn = true;
              break;
            }
          }
          
          if (!isJoinColumn) {
            mainRow[key] = row[key];
          }
        });

        // Process joins
        for (const join of joins) {
          const isOneToMany = join.isOneToMany || oneToManyJoins.includes(join);
          const isNestedChild = join.parentTable !== undefined;
          
          if (isNestedChild) {
            // Nested relation: child of another join (e.g., services inside employee_services)
            const parentJoin = joins.find(j => j.table === join.parentTable);
            if (parentJoin) {
              // Parent is one-to-many (employee_services), so we need to group
              const parentId = row[`${parentJoin.alias}_id`];
              if (parentId) {
                if (!arrayRelations[parentJoin.table]) {
                  arrayRelations[parentJoin.table] = new Map();
                }
                
                let parentRel = arrayRelations[parentJoin.table].get(parentId);
                if (!parentRel) {
                  parentRel = {};
                  // Add all parent columns (use alias instead of table name)
                  Object.keys(row).forEach(k => {
                    if (k.startsWith(`${parentJoin.alias}_`) && !k.startsWith(`${join.alias}_`)) {
                      const col = k.replace(`${parentJoin.alias}_`, '');
                      parentRel[col] = row[k];
                    }
                  });
                  arrayRelations[parentJoin.table].set(parentId, parentRel);
                }
                
                // Add nested child relation
                if (!parentRel[join.table]) {
                  parentRel[join.table] = {};
                }
                join.columns.forEach(col => {
                  // Use alias instead of table name for column lookup
                  const key = `${join.alias}_${col}`;
                  if (row[key] !== null && row[key] !== undefined) {
                    parentRel[join.table][col] = row[key];
                  }
                });
              }
            }
          } else if (isOneToMany) {
            // One-to-many relation: collect into array
            const relationId = row[`${join.alias}_id`];
            if (relationId) {
              if (!arrayRelations[join.table]) {
                arrayRelations[join.table] = new Map();
              }
              
              let relationObj = arrayRelations[join.table].get(relationId);
              if (!relationObj) {
                relationObj = { id: relationId };
                arrayRelations[join.table].set(relationId, relationObj);
              }
              
              join.columns.forEach(col => {
                // Use alias instead of table name for column lookup
                const key = `${join.alias}_${col}`;
                if (row[key] !== null && row[key] !== undefined) {
                  relationObj[col] = row[key];
                }
              });
            }
          } else {
            // One-to-one relation: single object
            join.columns.forEach(col => {
              // Use alias instead of table name for column lookup
              const key = `${join.alias}_${col}`;
              if (row[key] !== null && row[key] !== undefined) {
                if (!relations[join.table]) {
                  relations[join.table] = {};
                }
                relations[join.table][col] = row[key];
              }
            });
          }
        }

        // Attach one-to-one relations
        Object.keys(relations).forEach(relKey => {
          const hasData = Object.values(relations[relKey]).some(v => v !== null);
          if (hasData) {
            mainRow[relKey] = relations[relKey];
          }
        });
        
        // Attach one-to-many relations (arrays)
        Object.keys(arrayRelations).forEach(relKey => {
          const relationsArray = Array.from(arrayRelations[relKey].values()).filter(rel => {
            // Check if relation has data
            return Object.values(rel).some(v => v !== null && v !== undefined);
          });
          
          if (relationsArray.length > 0) {
            mainRow[relKey] = relationsArray;
          }
        });
        
        rowMap.set(mainRowId, mainRow);
      } else if (!isJoinTableQuery) {
        // Row already exists, merge one-to-many relations (skip for join tables - each row is separate)
        const existingRow = rowMap.get(mainRowId);
        
        for (const join of oneToManyJoins) {
          const relationId = row[`${join.alias}_id`];
          if (relationId) {
            if (!existingRow[join.table]) {
              existingRow[join.table] = [];
            }
            
            // Check if this relation already exists
            const existingRel = existingRow[join.table].find((r: any) => r.id === relationId);
            if (!existingRel) {
              // Create new relation object
              const newRel: any = { id: relationId };
              join.columns.forEach(col => {
                // Use alias instead of table name for column lookup
                const key = `${join.alias}_${col}`;
                if (row[key] !== null && row[key] !== undefined) {
                  newRel[col] = row[key];
                }
              });
              
              // Check for nested children
              const nestedChildJoin = joins.find(j => j.parentTable === join.table);
              if (nestedChildJoin) {
                const nestedRel: any = {};
                nestedChildJoin.columns.forEach(col => {
                  // Use alias instead of table name for column lookup
                  const key = `${nestedChildJoin.alias}_${col}`;
                  if (row[key] !== null && row[key] !== undefined) {
                    nestedRel[col] = row[key];
                  }
                });
                if (Object.keys(nestedRel).length > 0) {
                  newRel[nestedChildJoin.table] = nestedRel;
                }
              }
              
              existingRow[join.table].push(newRel);
            }
          }
        }
      }
    });
    
    const transformedRows = Array.from(rowMap.values());

    res.json(transformedRows);
  } catch (error: any) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Insert endpoint
router.post('/insert/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { data, returning = '*' } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'Data is required' });
    }

    // Validate table name to prevent SQL injection
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Get existing columns for the table
    const columnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1
    `;
    const columnsResult = await query(columnsQuery, [table]);
    const existingColumns = new Set(columnsResult.rows.map((row: any) => row.column_name));

    const records = Array.isArray(data) ? data : [data];
    const results = [];

    // For bulk inserts (arrays), use a more efficient approach
    if (records.length > 1) {
      // Get columns from first record (all records should have same structure)
      const firstRecord = records[0];
      const columns: string[] = [];
      const jsonbColumnIndices: number[] = [];
      const allValues: any[][] = [];

      // Process first record to determine columns
      Object.entries(firstRecord).forEach(([key, value]) => {
        // Validate column name to prevent SQL injection
        if (!/^[a-z_][a-z0-9_]*$/.test(key)) {
          console.warn(`[Insert] Invalid column name: "${key}", skipping...`);
          return;
        }
        // Only include columns that exist in the table
        if (!existingColumns.has(key)) {
          console.warn(`[Insert] Column "${key}" does not exist in table "${table}", skipping...`);
          return;
        }

        columns.push(key);

        // Handle JSONB columns
        const isJsonbColumn = key.includes('_settings') || key.includes('_config') || key.endsWith('_jsonb') || 
                              key === 'gallery_urls' || key === 'badges' || key === 'perks' || key === 'perks_ar';
        
        if (isJsonbColumn) {
          jsonbColumnIndices.push(columns.length - 1);
        }
      });

      if (columns.length === 0) {
        return res.status(400).json({ error: 'No valid columns to insert' });
      }

      // Process all records
      for (const record of records) {
        const processedValues: any[] = [];
        
        columns.forEach((col, idx) => {
          const value = record[col];
          const isJsonb = jsonbColumnIndices.includes(idx);
          
          if (isJsonb) {
            // For JSONB columns, stringify arrays and objects
            if (Array.isArray(value)) {
              processedValues.push(JSON.stringify(value));
            } else if (value && typeof value === 'object' && !(value instanceof Date)) {
              processedValues.push(JSON.stringify(value));
            } else if (value === null) {
              processedValues.push(null);
            } else {
              // String or other: try to parse as JSON first
              try {
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                processedValues.push(JSON.stringify(parsed));
              } catch {
                processedValues.push(JSON.stringify(value));
              }
            }
          } else {
            // Regular column
            processedValues.push(value);
          }
        });
        
        allValues.push(processedValues);
      }

      // Build bulk insert SQL with VALUES clause for all records
      // Calculate parameter indices correctly
      let paramCounter = 1;
      const valuePlaceholders = allValues.map((values) => {
        const placeholders = values.map((_, i) => {
          const isJsonb = jsonbColumnIndices.includes(i);
          const placeholder = isJsonb ? `$${paramCounter}::jsonb` : `$${paramCounter}`;
          paramCounter++;
          return placeholder;
        });
        return `(${placeholders.join(', ')})`;
      }).join(', ');

      const flatValues = allValues.flat();
      
      // Determine ON CONFLICT clause based on table
      let conflictClause = '';
      if (table === 'package_services') {
        conflictClause = 'ON CONFLICT (package_id, service_id) DO NOTHING';
      } else if (table === 'employee_services') {
        conflictClause = 'ON CONFLICT (employee_id, service_id, shift_id) DO NOTHING';
      } else {
        conflictClause = 'ON CONFLICT DO NOTHING';
      }
      
      const sql = conflictClause 
        ? `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuePlaceholders} ${conflictClause} RETURNING ${returning}`
        : `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${valuePlaceholders} RETURNING ${returning}`;
      
      console.log(`[Insert] Bulk inserting ${records.length} records into ${table}`);
      console.log(`[Insert] SQL preview: ${sql.substring(0, 250)}...`);
      console.log(`[Insert] Params: ${flatValues.length} values (expected: ${records.length * columns.length})`);
      const result = await query(sql, flatValues);
      console.log(`[Insert] ✅ Inserted ${result.rows.length} records (expected: ${records.length})`);
      if (result.rows.length !== records.length) {
        console.warn(`[Insert] ⚠️  Mismatch: Expected ${records.length} but got ${result.rows.length}`);
      }
      results.push(...result.rows);
    } else {
      // Single record insert (original logic)
      for (const record of records) {
        // Filter out columns that don't exist in the table and process JSONB columns
        const columns: string[] = [];
        const processedValues: any[] = [];
        const jsonbColumnIndices: number[] = [];

        Object.entries(record).forEach(([key, value]) => {
          // Validate column name to prevent SQL injection
          if (!/^[a-z_][a-z0-9_]*$/.test(key)) {
            console.warn(`[Insert] Invalid column name: "${key}", skipping...`);
            return;
          }
          // Only include columns that exist in the table
          if (!existingColumns.has(key)) {
            console.warn(`[Insert] Column "${key}" does not exist in table "${table}", skipping...`);
            return;
          }

          // Handle JSONB columns
          const isJsonbColumn = key.includes('_settings') || key.includes('_config') || key.endsWith('_jsonb') || 
                                key === 'gallery_urls' || key === 'badges' || key === 'perks' || key === 'perks_ar';
          
          columns.push(key);
          
          if (isJsonbColumn) {
            // For JSONB columns, stringify arrays and objects
            if (Array.isArray(value)) {
              processedValues.push(JSON.stringify(value));
              jsonbColumnIndices.push(columns.length - 1);
            } else if (value && typeof value === 'object' && !(value instanceof Date)) {
              processedValues.push(JSON.stringify(value));
              jsonbColumnIndices.push(columns.length - 1);
            } else if (value === null) {
              processedValues.push(null);
              jsonbColumnIndices.push(columns.length - 1);
            } else {
              // String or other: try to parse as JSON first
              try {
                const parsed = typeof value === 'string' ? JSON.parse(value) : value;
                processedValues.push(JSON.stringify(parsed));
                jsonbColumnIndices.push(columns.length - 1);
              } catch {
                processedValues.push(JSON.stringify(value));
                jsonbColumnIndices.push(columns.length - 1);
              }
            }
          } else {
            // Regular column
            processedValues.push(value);
          }
        });
        
        if (columns.length === 0) {
          console.warn(`[Insert] No valid columns to insert for table "${table}"`);
          continue;
        }

        // Build placeholders with JSONB casting where needed
        const placeholders = processedValues.map((_, i) => {
          if (jsonbColumnIndices.includes(i)) {
            return `$${i + 1}::jsonb`;
          }
          return `$${i + 1}`;
        }).join(', ');

        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING ${returning}`;
        const result = await query(sql, processedValues);
        results.push(...result.rows);
      }
    }

    res.json(Array.isArray(data) ? results : results[0]);
  } catch (error: any) {
    console.error('Insert error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update endpoint
router.post('/update/:table', async (req, res) => {
  try {
    const { table } = req.params;
    let { data, where } = req.body;

    if (!data || !where) {
      return res.status(400).json({ error: 'Data and where clause are required' });
    }

    // CRITICAL: Clean data immediately upon receipt - before any processing
    // This ensures no string "NULL" values make it through
    const cleanRequestBody = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj !== 'object') {
        // Primitive value - check if it's string "NULL"
        if (obj === 'NULL' || obj === 'null' || (typeof obj === 'string' && obj.trim().toUpperCase() === 'NULL')) {
          return null;
        }
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(cleanRequestBody);
      }
      const cleaned: any = {};
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        if (value === 'NULL' || value === 'null' || (typeof value === 'string' && value.trim().toUpperCase() === 'NULL')) {
          cleaned[key] = null;
        } else if (typeof value === 'object' && value !== null) {
          cleaned[key] = cleanRequestBody(value);
        } else {
          cleaned[key] = value;
        }
      });
      return cleaned;
    };

    console.log('[Update] BEFORE cleaning - Raw req.body.data:', JSON.stringify(data, null, 2));
    data = cleanRequestBody(data);
    console.log('[Update] AFTER cleaning - Cleaned data:', JSON.stringify(data, null, 2));

    // Validate table name to prevent SQL injection
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Get existing columns for the table with their data types
    const columnsQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = $1
    `;
    const columnsResult = await query(columnsQuery, [table]);
    const existingColumns = new Set(columnsResult.rows.map((row: any) => row.column_name));
    const columnTypes = new Map<string, { type: string; nullable: boolean }>();
    columnsResult.rows.forEach((row: any) => {
      columnTypes.set(row.column_name, { type: row.data_type, nullable: row.is_nullable === 'YES' });
    });

    const setClauses: string[] = [];
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Build SET clause - only include columns that exist in the table
    console.log(`[Update] ========================================`);
    console.log(`[Update] Processing ${Object.keys(data).length} fields for table "${table}"`);
    console.log(`[Update] Raw data received:`, JSON.stringify(data, null, 2));
    console.log(`[Update] Raw data types:`, Object.keys(data).reduce((acc, k) => {
      acc[k] = { type: typeof data[k], value: JSON.stringify(data[k]), isNull: data[k] === null, isUndefined: data[k] === undefined };
      return acc;
    }, {} as any));
    
    Object.entries(data).forEach(([key, value]) => {
      // Log the original value for debugging
      console.log(`[Update] ========================================`);
      console.log(`[Update] Processing field "${key}":`);
      console.log(`[Update]   - Raw value: ${JSON.stringify(value)}`);
      console.log(`[Update]   - Type: ${typeof value}`);
      console.log(`[Update]   - Is null: ${value === null}`);
      console.log(`[Update]   - Is undefined: ${value === undefined}`);
      console.log(`[Update]   - Is string "NULL": ${value === 'NULL' || value === 'null' || (typeof value === 'string' && value.trim().toUpperCase() === 'NULL')}`);
      console.log(`[Update]   - String representation: ${String(value)}`);
      
      // Skip if column doesn't exist (for optional fields like original_price, discount_percentage)
      if (!existingColumns.has(key)) {
        console.warn(`[Update] Column "${key}" does not exist in table "${table}", skipping...`);
        return;
      }

      // Validate column name to prevent SQL injection
      if (!/^[a-z_][a-z0-9_]*$/.test(key)) {
        console.warn(`[Update] Invalid column name: "${key}", skipping...`);
        return;
      }

      // Handle JSONB columns - ensure they're properly formatted
      const isJsonbColumn = key.includes('_settings') || key.includes('_config') || key.endsWith('_jsonb') || 
                            key === 'gallery_urls' || key === 'badges' || key === 'perks' || key === 'perks_ar';
      
      if (isJsonbColumn) {
        // For JSONB columns, handle arrays and objects
        if (Array.isArray(value)) {
          // Array: stringify directly (PostgreSQL JSONB accepts JSON arrays)
          setClauses.push(`${key} = $${paramIndex}::jsonb`);
          params.push(JSON.stringify(value));
        } else if (value && typeof value === 'object' && !(value instanceof Date)) {
          // Object: stringify
          setClauses.push(`${key} = $${paramIndex}::jsonb`);
          params.push(JSON.stringify(value));
        } else if (value === null) {
          // Null value for JSONB
          setClauses.push(`${key} = $${paramIndex}::jsonb`);
          params.push(null);
        } else {
          // String or other: try to parse as JSON first, otherwise wrap in quotes
          try {
            // If it's already a JSON string, parse and re-stringify to ensure validity
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            setClauses.push(`${key} = $${paramIndex}::jsonb`);
            params.push(JSON.stringify(parsed));
          } catch {
            // If parsing fails, treat as string and wrap in JSON
            setClauses.push(`${key} = $${paramIndex}::jsonb`);
            params.push(JSON.stringify(value));
          }
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Non-JSONB object: stringify for storage
        setClauses.push(`${key} = $${paramIndex}`);
        params.push(JSON.stringify(value));
      } else {
        // Regular value (string, number, boolean, array for non-JSONB, etc.)
        // CRITICAL FIX: Convert string "NULL" to actual null, and ensure proper type conversion
        let processedValue = value;
        
        // Get column info first
        const columnInfo = columnTypes.get(key);
        
        // Convert string "NULL" to actual null - check BEFORE type conversion
        if (value === 'NULL' || value === 'null' || (typeof value === 'string' && value.trim().toUpperCase() === 'NULL')) {
          // Only set to null if column is nullable, otherwise skip this field
          if (columnInfo && columnInfo.nullable) {
            processedValue = null;
          } else {
            // Column is NOT NULL, skip this field to avoid errors
            console.warn(`[Update] Skipping ${key} because value is "NULL" string but column is NOT NULL`);
            return; // Skip this field entirely
          }
        } else if (value === null || value === undefined) {
          // Already null or undefined
          if (columnInfo && columnInfo.nullable) {
            processedValue = null;
          } else {
            console.warn(`[Update] Skipping ${key} because value is null/undefined but column is NOT NULL`);
            return; // Skip this field entirely
          }
        } else if (value === '') {
          // Empty string - treat as null for nullable columns, skip for NOT NULL
          if (columnInfo && columnInfo.nullable) {
            processedValue = null;
          } else {
            console.warn(`[Update] Skipping ${key} because value is empty string but column is NOT NULL`);
            return; // Skip this field entirely
          }
        }
        
        // For integer/numeric columns, ensure the value is properly typed
        if (columnInfo && processedValue !== null) {
          const isIntegerType = columnInfo.type === 'integer' || columnInfo.type === 'bigint' || columnInfo.type === 'smallint';
          const isNumericType = columnInfo.type === 'numeric' || columnInfo.type === 'decimal' || columnInfo.type === 'real' || columnInfo.type === 'double precision';
          
          if (isIntegerType) {
            // Convert to integer - handle both string numbers and actual numbers
            if (typeof processedValue === 'string') {
              // Check if it's a string representation of "NULL"
              if (processedValue.trim().toUpperCase() === 'NULL') {
                if (columnInfo.nullable) {
                  processedValue = null;
                } else {
                  console.warn(`[Update] Skipping ${key} because value is "NULL" string but column is NOT NULL`);
                  return;
                }
              } else {
                const parsed = parseInt(processedValue.trim(), 10);
                if (isNaN(parsed)) {
                  console.warn(`[Update] Invalid integer value for ${key}: "${processedValue}", skipping...`);
                  return; // Skip this field
                }
                processedValue = parsed;
              }
            } else if (typeof processedValue === 'number') {
              // Already a number, but ensure it's an integer
              processedValue = Math.floor(processedValue);
            }
          } else if (isNumericType) {
            // Convert to number
            if (typeof processedValue === 'string') {
              if (processedValue.trim().toUpperCase() === 'NULL') {
                if (columnInfo.nullable) {
                  processedValue = null;
                } else {
                  console.warn(`[Update] Skipping ${key} because value is "NULL" string but column is NOT NULL`);
                  return;
                }
              } else {
                const parsed = parseFloat(processedValue.trim());
                if (isNaN(parsed)) {
                  console.warn(`[Update] Invalid numeric value for ${key}: "${processedValue}", skipping...`);
                  return; // Skip this field
                }
                processedValue = parsed;
              }
            }
          }
        }
        
        // Final check: if processedValue is still "NULL" as string, convert it
        if (typeof processedValue === 'string' && processedValue.trim().toUpperCase() === 'NULL') {
          const colInfo = columnTypes.get(key);
          if (colInfo && colInfo.nullable) {
            processedValue = null;
          } else {
            console.warn(`[Update] Final check: Skipping ${key} because value is still "NULL" string but column is NOT NULL`);
            return;
          }
        }
        
        // ABSOLUTE FINAL CHECK: Ensure no string "NULL" values are sent to integer columns
        if (columnInfo) {
          const isIntegerType = columnInfo.type === 'integer' || columnInfo.type === 'bigint' || columnInfo.type === 'smallint';
          if (isIntegerType) {
            // For integer columns, reject any string values (including "NULL")
            if (typeof processedValue === 'string') {
              console.error(`[Update] CRITICAL: Attempted to send string value "${processedValue}" to integer column ${key}. Skipping.`);
              return; // Skip this field entirely
            }
            // Ensure it's a valid integer or null
            if (processedValue !== null && (isNaN(Number(processedValue)) || !Number.isInteger(Number(processedValue)))) {
              console.error(`[Update] CRITICAL: Invalid integer value for ${key}: ${processedValue}. Skipping.`);
              return;
            }
          }
        }
        
        // ABSOLUTE FINAL CHECK: Reject any string values for integer columns
        if (columnInfo) {
          const isIntegerType = columnInfo.type === 'integer' || columnInfo.type === 'bigint' || columnInfo.type === 'smallint';
          if (isIntegerType) {
            if (typeof processedValue === 'string') {
              console.error(`[Update] CRITICAL ERROR: String value "${processedValue}" detected for integer column ${key}. Skipping field.`);
              return; // Skip this field entirely - this is a critical error
            }
            // Double-check: if it's null and column is NOT NULL, skip it
            if (processedValue === null && !columnInfo.nullable) {
              console.error(`[Update] CRITICAL ERROR: null value for NOT NULL integer column ${key}. Skipping field.`);
              return;
            }
            // Ensure it's a valid integer
            if (processedValue !== null && (!Number.isInteger(Number(processedValue)) || isNaN(Number(processedValue)))) {
              console.error(`[Update] CRITICAL ERROR: Invalid integer value "${processedValue}" for column ${key}. Skipping field.`);
              return;
            }
          }
        }
        
        // FINAL VALIDATION: Ensure processedValue is not a string for integer columns
        if (columnInfo) {
          const isIntegerType = columnInfo.type === 'integer' || columnInfo.type === 'bigint' || columnInfo.type === 'smallint';
          if (isIntegerType && typeof processedValue === 'string') {
            console.error(`[Update] FINAL VALIDATION FAILED: ${key} is still a string "${processedValue}" for integer column!`);
            console.error(`[Update] This should never happen. Skipping field.`);
            return;
          }
        }
        
        console.log(`[Update] ✓ Adding field ${key} = ${processedValue} (type: ${typeof processedValue}, column type: ${columnInfo?.type || 'unknown'})`);
        console.log(`[Update]   - Value to push to params: ${JSON.stringify(processedValue)}`);
        console.log(`[Update]   - Type of value to push: ${typeof processedValue}`);
        setClauses.push(`${key} = $${paramIndex}`);
        params.push(processedValue);
        console.log(`[Update]   - Params array after push:`, params.map((p, i) => `$${i + 1} = ${JSON.stringify(p)} (${typeof p})`).join(', '));
      }
      paramIndex++;
    });

    // Build WHERE clause
    Object.entries(where).forEach(([key, value]) => {
      whereClauses.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    });

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING *`;
    console.log(`[Update] ========================================`);
    console.log(`[Update] FINAL SQL: ${sql}`);
    console.log(`[Update] FINAL PARAMS COUNT: ${params.length}`);
    console.log(`[Update] FINAL PARAMS DETAILED:`);
    params.forEach((p, i) => {
      console.log(`[Update]   $${i + 1}: ${JSON.stringify(p)} (type: ${typeof p}, isNull: ${p === null}, isUndefined: ${p === undefined})`);
      // Check if any param is string "NULL"
      if (p === 'NULL' || p === 'null' || (typeof p === 'string' && String(p).trim().toUpperCase() === 'NULL')) {
        console.error(`[Update] ⚠️⚠️⚠️ CRITICAL: Param $${i + 1} is string "NULL"! This will cause the error!`);
      }
    });
    console.log(`[Update] ========================================`);
    
    const result = await query(sql, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('[Update] ERROR:', error);
    console.error('[Update] Error message:', error.message);
    console.error('[Update] Error code:', error.code);
    console.error('[Update] Error detail:', error.detail);
    res.status(500).json({ error: error.message });
  }
});

// Delete endpoint
router.post('/delete/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const { where } = req.body;

    if (!where) {
      return res.status(400).json({ error: 'Where clause is required' });
    }

    // Validate table name to prevent SQL injection
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(where).forEach(([key, value]) => {
      // Validate column name to prevent SQL injection
      if (!/^[a-z_][a-z0-9_]*$/.test(key)) {
        throw new Error(`Invalid column name: ${key}`);
      }
      
      if (Array.isArray(value)) {
        whereClauses.push(`${key} = ANY($${paramIndex})`);
        params.push(value);
      } else {
        whereClauses.push(`${key} = $${paramIndex}`);
        params.push(value);
      }
      paramIndex++;
    });

    if (whereClauses.length === 0) {
      return res.status(400).json({ error: 'At least one where condition is required' });
    }

    // For services table, warn about related bookings but allow deletion (CASCADE will handle it)
    if (table === 'services' && where.id) {
      const checkBookingsSql = `SELECT COUNT(*) as booking_count FROM bookings WHERE service_id = $1`;
      const bookingCheck = await query(checkBookingsSql, [where.id]);
      const bookingCount = parseInt(bookingCheck.rows[0]?.booking_count || '0');
      
      if (bookingCount > 0) {
        console.log(`[Delete] Warning: Deleting service ${where.id} will also delete ${bookingCount} associated booking(s) due to CASCADE`);
        // Continue with deletion - CASCADE will handle related bookings
      }
    }

    const sql = `DELETE FROM ${table} WHERE ${whereClauses.join(' AND ')} RETURNING *`;
    console.log('[Delete] SQL:', sql);
    console.log('[Delete] Params:', params);
    
    const result = await query(sql, params);

    res.json(result.rows);
  } catch (error: any) {
    console.error('Delete error:', error);
    
    // Handle foreign key constraint violations with user-friendly messages
    if (error.code === '23503') {
      // Foreign key constraint violation
      const constraint = error.constraint || 'unknown';
      const referencedTable = error.table || 'related records';
      const tableName = req.params.table || 'record';
      
      let message = `Cannot delete this record because it is referenced by ${referencedTable}.`;
      
      if (tableName === 'services' && constraint.includes('bookings')) {
        message = 'Cannot delete service because it has associated bookings. Please delete or reassign the bookings first.';
      } else if (tableName === 'shifts' && constraint.includes('bookings')) {
        message = 'Cannot delete shift because it has associated bookings. Please delete or reassign the bookings first.';
      } else if (tableName === 'slots' && constraint.includes('bookings')) {
        message = 'Cannot delete slot because it has associated bookings. Please delete or reassign the bookings first.';
      }
      
      return res.status(409).json({ 
        error: 'Cannot delete record',
        message: message,
        details: {
          constraint: constraint,
          table: referencedTable,
          code: error.code
        }
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// RPC endpoint (for database functions)
router.post('/rpc/:function', async (req, res) => {
  try {
    const { function: functionName } = req.params;
    const params = req.body || {};

    const paramNames = Object.keys(params);
    const paramValues = Object.values(params);
    const placeholders = paramNames.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `SELECT * FROM ${functionName}(${placeholders})`;
    const result = await query(sql, paramValues);

    res.json(result.rows);
  } catch (error: any) {
    console.error('RPC error:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as queryRoutes };
