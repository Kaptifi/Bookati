-- Create function to trigger Zoho receipt generation on payment confirmation
CREATE OR REPLACE FUNCTION trigger_zoho_receipt_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when payment_status changes to 'paid' from any other status
  IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
    -- Only queue if Zoho invoice hasn't been created yet
    IF NEW.zoho_invoice_id IS NULL THEN
      -- Queue job for Zoho receipt generation
      INSERT INTO queue_jobs (job_type, payload, status)
      VALUES (
        'zoho_receipt',
        jsonb_build_object(
          'booking_id', NEW.id,
          'tenant_id', NEW.tenant_id,
          'attempt', 0
        ),
        'pending'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on bookings table
DROP TRIGGER IF EXISTS zoho_receipt_trigger ON bookings;
CREATE TRIGGER zoho_receipt_trigger
AFTER UPDATE OF payment_status ON bookings
FOR EACH ROW
WHEN (NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid'))
EXECUTE FUNCTION trigger_zoho_receipt_on_payment();

-- Also trigger on INSERT if booking is created with payment_status = 'paid' (e.g., package bookings)
CREATE OR REPLACE FUNCTION trigger_zoho_receipt_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- If booking is created with payment_status = 'paid', queue receipt generation
  IF NEW.payment_status = 'paid' AND NEW.zoho_invoice_id IS NULL THEN
    INSERT INTO queue_jobs (job_type, payload, status)
    VALUES (
      'zoho_receipt',
      jsonb_build_object(
        'booking_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'attempt', 0
      ),
      'pending'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS zoho_receipt_trigger_insert ON bookings;
CREATE TRIGGER zoho_receipt_trigger_insert
AFTER INSERT ON bookings
FOR EACH ROW
WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION trigger_zoho_receipt_on_insert();

