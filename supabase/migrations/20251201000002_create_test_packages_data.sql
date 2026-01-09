/*
  # Create Test Data for Packages Feature

  This migration creates:
  - 10 test services with realistic data
  - 5 test packages with different combinations
  - Test user account for viewing packages

  Note: This assumes the tenant for 'zain@gmail.com' exists.
  If not, you may need to adjust the tenant_id.
*/

-- First, get the tenant_id for zain@gmail.com
DO $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid;
  v_service_ids uuid[] := ARRAY[]::uuid[];
  v_package_ids uuid[] := ARRAY[]::uuid[];
  v_service_id uuid;
  v_package_id uuid;
  v_original_price numeric;
  v_total_price numeric;
  v_discount_percentage integer;
BEGIN
  -- Get tenant_id from user
  SELECT tenant_id INTO v_tenant_id
  FROM users
  WHERE email = 'zain@gmail.com'
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'User zain@gmail.com not found. Please ensure the user exists.';
  END IF;

  RAISE NOTICE 'Using tenant_id: %', v_tenant_id;

  -- Create 10 test services
  INSERT INTO services (
    tenant_id, name, name_ar, description, description_ar,
    base_price, duration_minutes, capacity_per_slot, service_capacity_per_slot,
    service_duration_minutes, capacity_mode, is_public, is_active
  ) VALUES
  (
    v_tenant_id,
    'Burj Khalifa Observation Deck',
    'سطح المراقبة في برج خليفة',
    'Experience breathtaking views from the world''s tallest building',
    'استمتع بإطلالات خلابة من أطول مبنى في العالم',
    150, 60, 20, 20, 60, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Dubai Aquarium & Underwater Zoo',
    'دبي أكواريوم وحديقة الحيوانات المائية',
    'Explore the underwater world with thousands of marine animals',
    'استكشف العالم تحت الماء مع آلاف الحيوانات البحرية',
    120, 90, 30, 30, 90, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Desert Safari Adventure',
    'مغامرة رحلة الصحراء',
    'Thrilling dune bashing, camel rides, and traditional dinner',
    'ركوب الكثبان الرملية المثيرة، ركوب الجمال، والعشاء التقليدي',
    200, 240, 15, 15, 240, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Dubai Marina Cruise',
    'رحلة بحرية في مارينا دبي',
    'Scenic boat tour through Dubai Marina and Palm Jumeirah',
    'جولة بحرية خلابة عبر مارينا دبي وجزيرة النخيل',
    80, 90, 40, 40, 90, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Dubai Frame Experience',
    'تجربة إطار دبي',
    'Visit the iconic Dubai Frame with panoramic city views',
    'زيارة إطار دبي الأيقوني مع إطلالات بانورامية على المدينة',
    60, 60, 25, 25, 60, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'IMG Worlds of Adventure',
    'عوالم إم جي للمغامرات',
    'Largest indoor theme park in the world',
    'أكبر حديقة ألعاب مغلقة في العالم',
    250, 360, 50, 50, 360, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Dubai Museum & Al Fahidi Fort',
    'متحف دبي وقلعة الفهيدي',
    'Discover Dubai''s rich history and heritage',
    'اكتشف تاريخ دبي الغني وتراثها',
    30, 90, 35, 35, 90, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Dubai Garden Glow',
    'حديقة دبي المضيئة',
    'Magical illuminated garden with art installations',
    'حديقة مضيئة سحرية مع منحوتات فنية',
    70, 120, 40, 40, 120, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Dubai Miracle Garden',
    'حديقة دبي المعجزة',
    'World''s largest natural flower garden',
    'أكبر حديقة زهور طبيعية في العالم',
    55, 120, 45, 45, 120, 'service_based', true, true
  ),
  (
    v_tenant_id,
    'Dubai Gold Souk Tour',
    'جولة سوق الذهب في دبي',
    'Explore the traditional gold market with expert guide',
    'استكشف سوق الذهب التقليدي مع مرشد خبير',
    40, 60, 20, 20, 60, 'service_based', true, true
  )
  RETURNING id INTO v_service_ids;

  -- Store service IDs
  SELECT array_agg(id) INTO v_service_ids
  FROM services
  WHERE tenant_id = v_tenant_id
    AND name IN (
      'Burj Khalifa Observation Deck',
      'Dubai Aquarium & Underwater Zoo',
      'Desert Safari Adventure',
      'Dubai Marina Cruise',
      'Dubai Frame Experience',
      'IMG Worlds of Adventure',
      'Dubai Museum & Al Fahidi Fort',
      'Dubai Garden Glow',
      'Dubai Miracle Garden',
      'Dubai Gold Souk Tour'
    );

  RAISE NOTICE 'Created % services', array_length(v_service_ids, 1);

  -- Create Package 1: Dubai Essentials Package (Services 1, 2, 4)
  -- Original: 150 + 120 + 80 = 350, Discount 15% = 52.5, Total: 297.5
  v_original_price := 150 + 120 + 80;
  v_discount_percentage := 15;
  v_total_price := v_original_price * (1 - v_discount_percentage / 100.0);

  INSERT INTO service_packages (
    tenant_id, name, name_ar, description, description_ar,
    total_price, original_price, discount_percentage, is_active
  ) VALUES (
    v_tenant_id,
    'Dubai Essentials Package',
    'باقة أساسيات دبي',
    'Perfect introduction to Dubai''s top attractions',
    'مقدمة مثالية لأهم معالم دبي',
    v_total_price, v_original_price, v_discount_percentage, true
  ) RETURNING id INTO v_package_id;

  INSERT INTO package_services (package_id, service_id, quantity)
  SELECT v_package_id, id, 1
  FROM services
  WHERE tenant_id = v_tenant_id
    AND name IN ('Burj Khalifa Observation Deck', 'Dubai Aquarium & Underwater Zoo', 'Dubai Marina Cruise')
  LIMIT 3;

  -- Create Package 2: Dubai Adventure Combo (Services 3, 6, 8)
  -- Original: 200 + 250 + 70 = 520, Discount 20% = 104, Total: 416
  v_original_price := 200 + 250 + 70;
  v_discount_percentage := 20;
  v_total_price := v_original_price * (1 - v_discount_percentage / 100.0);

  INSERT INTO service_packages (
    tenant_id, name, name_ar, description, description_ar,
    total_price, original_price, discount_percentage, is_active
  ) VALUES (
    v_tenant_id,
    'Dubai Adventure Combo',
    'باقة مغامرات دبي',
    'Thrilling experiences for adventure seekers',
    'تجارب مثيرة لعشاق المغامرات',
    v_total_price, v_original_price, v_discount_percentage, true
  ) RETURNING id INTO v_package_id;

  INSERT INTO package_services (package_id, service_id, quantity)
  SELECT v_package_id, id, 1
  FROM services
  WHERE tenant_id = v_tenant_id
    AND name IN ('Desert Safari Adventure', 'IMG Worlds of Adventure', 'Dubai Garden Glow')
  LIMIT 3;

  -- Create Package 3: Dubai Culture & Heritage (Services 7, 10, 5)
  -- Original: 30 + 40 + 60 = 130, Discount 10% = 13, Total: 117
  v_original_price := 30 + 40 + 60;
  v_discount_percentage := 10;
  v_total_price := v_original_price * (1 - v_discount_percentage / 100.0);

  INSERT INTO service_packages (
    tenant_id, name, name_ar, description, description_ar,
    total_price, original_price, discount_percentage, is_active
  ) VALUES (
    v_tenant_id,
    'Dubai Culture & Heritage',
    'باقة الثقافة والتراث في دبي',
    'Explore Dubai''s rich history and culture',
    'استكشف تاريخ دبي وثقافتها الغنية',
    v_total_price, v_original_price, v_discount_percentage, true
  ) RETURNING id INTO v_package_id;

  INSERT INTO package_services (package_id, service_id, quantity)
  SELECT v_package_id, id, 1
  FROM services
  WHERE tenant_id = v_tenant_id
    AND name IN ('Dubai Museum & Al Fahidi Fort', 'Dubai Gold Souk Tour', 'Dubai Frame Experience')
  LIMIT 3;

  -- Create Package 4: Dubai Family Fun Package (Services 2, 6, 9)
  -- Original: 120 + 250 + 55 = 425, Discount 18% = 76.5, Total: 348.5
  v_original_price := 120 + 250 + 55;
  v_discount_percentage := 18;
  v_total_price := v_original_price * (1 - v_discount_percentage / 100.0);

  INSERT INTO service_packages (
    tenant_id, name, name_ar, description, description_ar,
    total_price, original_price, discount_percentage, is_active
  ) VALUES (
    v_tenant_id,
    'Dubai Family Fun Package',
    'باقة المرح العائلي في دبي',
    'Family-friendly attractions and activities',
    'معالم وأنشطة مناسبة للعائلات',
    v_total_price, v_original_price, v_discount_percentage, true
  ) RETURNING id INTO v_package_id;

  INSERT INTO package_services (package_id, service_id, quantity)
  SELECT v_package_id, id, 1
  FROM services
  WHERE tenant_id = v_tenant_id
    AND name IN ('Dubai Aquarium & Underwater Zoo', 'IMG Worlds of Adventure', 'Dubai Miracle Garden')
  LIMIT 3;

  -- Create Package 5: Dubai Premium Experience (Services 1, 3, 4, 6)
  -- Original: 150 + 200 + 80 + 250 = 680, Discount 25% = 170, Total: 510
  v_original_price := 150 + 200 + 80 + 250;
  v_discount_percentage := 25;
  v_total_price := v_original_price * (1 - v_discount_percentage / 100.0);

  INSERT INTO service_packages (
    tenant_id, name, name_ar, description, description_ar,
    total_price, original_price, discount_percentage, is_active
  ) VALUES (
    v_tenant_id,
    'Dubai Premium Experience',
    'باقة التجربة المميزة في دبي',
    'Ultimate Dubai experience with top attractions',
    'تجربة دبي المثالية مع أهم المعالم',
    v_total_price, v_original_price, v_discount_percentage, true
  ) RETURNING id INTO v_package_id;

  INSERT INTO package_services (package_id, service_id, quantity)
  SELECT v_package_id, id, 1
  FROM services
  WHERE tenant_id = v_tenant_id
    AND name IN ('Burj Khalifa Observation Deck', 'Desert Safari Adventure', 'Dubai Marina Cruise', 'IMG Worlds of Adventure')
  LIMIT 4;

  RAISE NOTICE 'Created 5 test packages';

  -- Create test user (if auth.users table exists and we have access)
  -- Note: This may require admin privileges
  BEGIN
    INSERT INTO users (email, role, tenant_id, full_name, full_name_ar)
    VALUES (
      'testuser@example.com',
      'customer',
      v_tenant_id,
      'Test User',
      'مستخدم تجريبي'
    )
    ON CONFLICT (email) DO NOTHING;
    
    RAISE NOTICE 'Test user created or already exists: testuser@example.com';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not create test user (may require auth setup): %', SQLERRM;
  END;

  RAISE NOTICE 'Test data creation completed successfully!';
  RAISE NOTICE 'Service Provider: zain@gmail.com / 1111';
  RAISE NOTICE 'Test User: testuser@example.com / TestUser123!';

END $$;



