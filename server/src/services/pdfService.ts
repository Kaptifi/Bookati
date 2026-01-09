import { query } from '../db';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import JsBarcode from 'jsbarcode';
import { createCanvas } from 'canvas';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
// Import arabic-reshaper for proper Arabic text shaping
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const arabicReshaperLib = require('arabic-reshaper');

interface BookingData {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  slot_date: string;
  start_time: string;
  end_time: string;
  visitor_count: number;
  adult_count?: number | null;
  child_count?: number | null;
  total_price: number;
  service_name?: string;
  service_name_ar?: string;
  tenant_name?: string;
  tenant_name_ar?: string;
  created_at?: string;
}

/**
 * Generate QR code as data URL
 */
async function generateQRCodeDataURL(bookingId: string): Promise<string> {
  try {
    const qrDataURL = await QRCode.toDataURL(bookingId, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 200,
      margin: 1,
    });
    return qrDataURL;
  } catch (error: any) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generate barcode as buffer (for vertical display)
 * Uses full booking ID to ensure uniqueness and proper validation
 */
function generateBarcodeBuffer(bookingId: string): Buffer {
  try {
    // Create canvas for vertical barcode (taller than wide)
    const canvas = createCanvas(100, 200);
    // Use full booking ID without dashes (32 hex characters)
    // This ensures uniqueness and allows proper reconstruction of booking ID when scanned
    const barcodeData = bookingId.replace(/-/g, '');
    JsBarcode(canvas, barcodeData, {
      format: 'CODE128',
      width: 2,
      height: 150,
      displayValue: false,
      margin: 0,
    });
    return canvas.toBuffer('image/png');
  } catch (error: any) {
    console.error('Error generating barcode:', error);
    // Return empty buffer if barcode generation fails
    return Buffer.alloc(0);
  }
}

/**
 * Format date for display (MM-DD-YYYY format like in ticket template)
 */
function formatDate(dateString: string, language: 'en' | 'ar'): string {
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Format time with AM/PM
 */
function formatTime(timeString: string): string {
  // If time is already in HH:MM format, convert to 12-hour format
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

/**
 * Format time range
 */
function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime} - ${endTime}`;
}

/**
 * Generate PDF ticket for a booking (redesigned to match ticket template)
 * @param bookingId - The booking ID
 * @param language - Language for the ticket ('en' or 'ar')
 * @param ticketNumber - Optional: Ticket number (1-based) if multiple tickets
 * @param totalTickets - Optional: Total number of tickets in the booking
 * @param ticketType - Optional: 'adult' or 'child' for individual ticket type
 * @param ticketPrice - Optional: Individual ticket price (for adult or child)
 */
export async function generateBookingTicketPDF(
  bookingId: string, 
  language: 'en' | 'ar' = 'en',
  ticketNumber?: number,
  totalTickets?: number,
  ticketType?: 'adult' | 'child',
  ticketPrice?: number
): Promise<Buffer> {
  try {
    // Note: Font registration will be done AFTER creating the PDF document
    // because registerFont is an instance method, not a static method
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    
    // Prepare font paths to try
    const possibleFontPaths = [
      // Project fonts directory (highest priority - downloaded font)
      join(__dirname, '../../fonts/NotoSansArabic-Regular.ttf'), // Noto Sans Arabic (best quality)
      join(__dirname, '../../fonts/Amiri-Regular.ttf'),
      // Windows fonts (prioritize Tahoma for better Arabic support)
      'C:/Windows/Fonts/tahoma.ttf', // Tahoma has excellent Arabic support
      'C:/Windows/Fonts/tahomabd.ttf', // Tahoma Bold
      'C:/Windows/Fonts/arialuni.ttf', // Arial Unicode MS (full Unicode support)
      'C:/Windows/Fonts/arial.ttf', // Regular Arial (limited Arabic)
      // Linux fonts
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
      // macOS fonts
      '/System/Library/Fonts/Supplemental/Arial.ttf',
      '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    ];
    
    // Find available font path
    let arabicFontPath: string | null = null;
    for (const fontPath of possibleFontPaths) {
      if (existsSync(fontPath)) {
        arabicFontPath = fontPath;
        console.log(`✅ Found Arabic font at: ${fontPath}`);
        break;
      }
    }
    
    // Always use the selected language
    let effectiveLanguage: 'en' | 'ar' = language;
    
    if (language === 'ar' && !arabicFontPath) {
      console.warn('⚠️  No Arabic font found. Arabic text will be used but may display incorrectly.');
      console.warn('   To fix: Download Noto Sans Arabic from https://fonts.google.com/noto/specimen/Noto+Sans+Arabic');
      console.warn('   Place it in: project/server/fonts/NotoSansArabic-Regular.ttf');
    }

    // Fetch booking details with tenant design settings and service prices
    const bookingResult = await query(
      `SELECT 
        b.id, b.customer_name, b.customer_phone, b.customer_email,
        b.created_at, b.package_id, b.offer_id,
        sl.slot_date, sl.start_time, sl.end_time,
        b.visitor_count, b.adult_count, b.child_count, b.total_price,
        s.name as service_name, s.name_ar as service_name_ar,
        s.base_price, s.child_price,
        t.name as tenant_name, t.name_ar as tenant_name_ar,
        t.landing_page_settings
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN tenants t ON b.tenant_id = t.id
      JOIN slots sl ON b.slot_id = sl.id
      WHERE b.id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      throw new Error('Booking not found');
    }

    const booking: BookingData & { 
      package_id?: string | null;
      base_price?: number;
      child_price?: number | null;
      offer_id?: string | null;
    } = bookingResult.rows[0];
    const tenantSettings = bookingResult.rows[0].landing_page_settings;
    
    // Determine individual ticket price
    let individualTicketPrice: number;
    if (ticketPrice !== undefined) {
      // Use provided ticket price
      individualTicketPrice = ticketPrice;
    } else if (ticketType === 'child' && booking.child_price !== null && booking.child_price !== undefined) {
      // Child ticket price
      individualTicketPrice = parseFloat(String(booking.child_price));
    } else {
      // Adult ticket price (use base_price or calculate from total)
      if (booking.base_price !== undefined && booking.base_price !== null) {
        individualTicketPrice = parseFloat(String(booking.base_price));
      } else {
        // Fallback: calculate average price per ticket
        const totalPrice = parseFloat(String(booking.total_price || 0));
        const totalVisitors = booking.visitor_count || 1;
        individualTicketPrice = totalPrice / totalVisitors;
      }
    }
    
    // If offer is selected, fetch offer price
    if (booking.offer_id && !ticketPrice && ticketType !== 'child') {
      const offerResult = await query(
        `SELECT price FROM service_offers WHERE id = $1`,
        [booking.offer_id]
      );
      if (offerResult.rows.length > 0) {
        // Use offer price for adults, child price remains as is
        individualTicketPrice = parseFloat(String(offerResult.rows[0].price));
      }
    }

    // Fetch package details and services if this is a package booking
    let packageName: string | null = null;
    let packageNameAr: string | null = null;
    let packageServices: Array<{ name: string; name_ar: string | null }> = [];
    
    if (booking.package_id) {
      const packageResult = await query(
        `SELECT 
          sp.name, sp.name_ar,
          s.name as service_name, s.name_ar as service_name_ar
        FROM service_packages sp
        LEFT JOIN package_services ps ON sp.id = ps.package_id
        LEFT JOIN services s ON ps.service_id = s.id
        WHERE sp.id = $1
        ORDER BY ps.id`,
        [booking.package_id]
      );

      if (packageResult.rows.length > 0) {
        packageName = packageResult.rows[0].name;
        packageNameAr = packageResult.rows[0].name_ar;
        // Collect all services in the package
        packageServices = packageResult.rows
          .filter(row => row.service_name) // Filter out null services
          .map(row => ({
            name: row.service_name,
            name_ar: row.service_name_ar
          }));
      }
    }

    // Get design colors from landing page settings
    let primaryColor = '#2563eb'; // Default blue
    let secondaryColor = '#3b82f6'; // Default light blue
    
    if (tenantSettings) {
      try {
        const settings = typeof tenantSettings === 'string' 
          ? JSON.parse(tenantSettings) 
          : tenantSettings;
        primaryColor = settings.primary_color || primaryColor;
        secondaryColor = settings.secondary_color || secondaryColor;
      } catch (error) {
        console.warn('Error parsing tenant settings:', error);
      }
    }

    // Generate QR code and barcode
    const qrDataURL = await generateQRCodeDataURL(bookingId);
    const qrBuffer = Buffer.from(qrDataURL.split(',')[1], 'base64');
    const barcodeBuffer = generateBarcodeBuffer(bookingId);

    // Helper function to get font and alignment based on effective language
    // Try to use Arabic font if available, otherwise use Helvetica (may show garbled Arabic)
    const getFontAndAlign = (isBold: boolean = false) => {
      if (effectiveLanguage === 'ar') {
        if (arabicFontRegistered) {
          // Use registered Arabic font with RTL alignment
          // Try bold version if available, otherwise use regular
          const fontToUse = isBold && arabicBoldFontRegistered
            ? `${arabicFontName}-Bold`
            : arabicFontName;
          return {
            font: fontToUse,
            align: 'right' as const,
            direction: 'rtl' as const
          };
        } else {
          // Try to use Helvetica with RTL alignment - may show garbled text but attempts Arabic
          // Note: This will show garbled Arabic, but user requested Arabic text
          return {
            font: isBold ? 'Helvetica-Bold' : 'Helvetica',
            align: 'right' as const,
            direction: 'rtl' as const
          };
        }
      }
      // For English, use Helvetica with left alignment
      return {
        font: isBold ? 'Helvetica-Bold' : 'Helvetica',
        align: 'left' as const,
        direction: 'ltr' as const
      };
    };
    
    // Helper function to process Arabic text for PDFKit display
    // Strategy: Reshape for letter connections, then reverse WORD ORDER (not characters)
    // This preserves letter connections while achieving RTL display
    const reshapeArabicText = (text: string): string => {
      try {
        if (!text || text.trim().length === 0) {
          return text;
        }
        
        // Step 1: Reshape Arabic text for proper letter connections
        // This converts letters to contextual forms: تذكرة → ﺗﺬﻛﺮﺓ
        let reshaped: string = text;
        if (arabicReshaperLib && typeof arabicReshaperLib.convertArabic === 'function') {
          reshaped = arabicReshaperLib.convertArabic(text);
        }
        
        // Step 2: Reverse WORD ORDER (not character order within words)
        // Split by spaces, reverse the array, join back
        // This preserves letter connections while achieving RTL word order
        const words = reshaped.split(' ');
        const reversedWordOrder = words.reverse().join(' ');
        
        return reversedWordOrder;
      } catch (error: any) {
        console.warn(`⚠️  Failed to reshape Arabic text: ${error.message}`);
        // Fallback: reverse word order only
        const words = text.split(' ');
        return words.reverse().join(' ');
      }
    };
    
    // Helper function to get text based on effective language
    // Always use Arabic text when Arabic is selected (respects user choice)
    // Only fall back to English if Arabic text is not available in database
    const getText = (englishText: string, arabicText?: string | null): string => {
      if (effectiveLanguage === 'ar') {
        // User selected Arabic - use Arabic text if available
        if (arabicText && arabicText.trim().length > 0) {
          // Reshape and reverse Arabic text for proper display
          const shapedText = reshapeArabicText(arabicText);
          return shapedText;
        }
        // If no Arabic text in database, fall back to English
        return englishText;
      }
      // For English language, always use English
      return englishText;
    };

    // Create PDF document - Letter size for ticket format
    // Enable advanced text features for proper Arabic rendering
    const doc = new PDFDocument({
      size: [612, 792], // Letter size in points (8.5 x 11 inches)
      margin: 0,
      features: ['rtla', 'calt'], // Enable RTL and contextual alternates for Arabic
      lang: language === 'ar' ? 'ar' : 'en', // Set document language
    });
    
    // Register Arabic font AFTER creating the document (registerFont is an instance method)
    let arabicFontRegistered = false;
    let arabicBoldFontRegistered = false;
    const arabicFontName = 'ArabicFont';
    
    if (arabicFontPath) {
      try {
        doc.registerFont(arabicFontName, arabicFontPath);
        arabicFontRegistered = true;
        console.log(`✅ Arabic font registered successfully: ${arabicFontPath}`);
        
        // Try to register bold version
        const boldFontPath = arabicFontPath.replace('.ttf', 'bd.ttf').replace('Regular', 'Bold');
        if (existsSync(boldFontPath)) {
          try {
            doc.registerFont(`${arabicFontName}-Bold`, boldFontPath);
            arabicBoldFontRegistered = true;
            console.log(`✅ Arabic bold font registered: ${boldFontPath}`);
          } catch (boldError: any) {
            console.log(`   Note: Bold version not available, using regular font for bold text`);
          }
        }
      } catch (error: any) {
        console.error(`❌ Failed to register Arabic font: ${error.message}`);
        arabicFontRegistered = false;
      }
    }
    
    if (language === 'ar' && arabicFontRegistered) {
      console.log('✅ Arabic font ready - Arabic text will display correctly');
    } else if (language === 'ar' && !arabicFontRegistered) {
      console.warn('⚠️  Arabic font not registered - Arabic text may appear garbled');
    }

    // Collect PDF data
    const chunks: Buffer[] = [];
    let pdfResolve: (value: Buffer) => void;
    let pdfReject: (error: Error) => void;
    
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      pdfResolve = resolve;
      pdfReject = reject;
    });
    
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      try {
        const pdfBuffer = Buffer.concat(chunks);
        pdfResolve!(pdfBuffer);
      } catch (error: any) {
        pdfReject!(new Error(`Failed to create PDF buffer: ${error.message}`));
      }
    });
    doc.on('error', (error: Error) => {
      pdfReject!(error);
    });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 40;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = margin;

    // ============================================
    // HEADER - Using tenant design colors
    // ============================================
    const headerHeight = 80;
    
    // Header background using primary color
    doc.rect(0, 0, pageWidth, headerHeight)
       .fill(primaryColor);
    
    // Header accent line using secondary color
    doc.rect(0, headerHeight - 4, pageWidth, 4)
       .fill(secondaryColor);
    
    // Header text with better spacing
    const headerFont = getFontAndAlign(true);
    doc.fillColor('#FFFFFF')
       .fontSize(24)
       .font(headerFont.font)
       .text(getText('BOOKING TICKET', 'تذكرة الحجز'), margin, 20, {
         width: contentWidth,
         align: headerFont.align,
       });
    
    // Show ticket number if multiple tickets
    let instructionY = 50;
    if (ticketNumber && totalTickets && totalTickets > 1) {
      const ticketNumFont = getFontAndAlign(true);
      doc.fontSize(11)
         .font(ticketNumFont.font)
         .fillColor('#E8F4F8')
         .text(
           getText(
             `Ticket ${ticketNumber} of ${totalTickets}`,
             `تذكرة ${ticketNumber} من ${totalTickets}`
           ),
           margin,
           50,
           {
             width: contentWidth,
             align: ticketNumFont.align,
           }
         );
      instructionY = 70;
    }
    
    const instructionFont = getFontAndAlign(false);
    doc.fontSize(11)
       .font(instructionFont.font)
       .fillColor('#E8F4F8')
       .text(
         getText(
           'Please print this ticket and present it at the event',
           'يرجى طباعة هذه التذكرة وإحضارها معك عند الوصول'
         ),
         margin,
         instructionY,
         {
           width: contentWidth,
           align: instructionFont.align,
         }
       );
    
    yPos = headerHeight + (ticketNumber && totalTickets && totalTickets > 1 ? 50 : 30);

    // ============================================
    // EVENT DETAILS SECTION - Enhanced with box
    // ============================================
    const eventBoxY = yPos;
    // Adjust height if package booking (to accommodate services list)
    const eventBoxHeight = booking.package_id && packageServices.length > 0 
      ? 180 + (packageServices.length * 15) + 25 
      : 180;
    
    // Event box background
    doc.rect(margin, eventBoxY, contentWidth, eventBoxHeight)
       .fill('#F8F9FA')
       .stroke('#E1E8ED')
       .lineWidth(1);
    
    // Section title with icon-like styling
    const sectionTitleFont = getFontAndAlign(true);
    doc.fillColor('#2C3E50')
       .fontSize(12)
       .font(sectionTitleFont.font)
       .text(getText('EVENT DETAILS', 'تفاصيل الحدث'), margin + 15, eventBoxY + 15, {
         align: sectionTitleFont.align,
         width: contentWidth - 30
       });
    
    // Divider line under title using primary color
    doc.moveTo(margin + 15, eventBoxY + 35)
       .lineTo(margin + contentWidth - 15, eventBoxY + 35)
       .strokeColor(primaryColor)
       .lineWidth(2)
       .stroke();
    
    yPos = eventBoxY + 50;
    
    // Event name - larger and prominent
    // If package booking, show package name; otherwise show service name
    // Use effectiveLanguage to ensure we get readable text
    const displayName = booking.package_id && packageName
      ? getText(packageName, packageNameAr)
      : getText(booking.service_name || 'Service', booking.service_name_ar);
    
    const eventNameFont = getFontAndAlign(true);
    doc.fillColor('#1A1A1A')
       .fontSize(20)
       .font(eventNameFont.font)
       .text(
         displayName || 'Service',
         margin + 15,
         yPos,
         { width: contentWidth - 30, align: eventNameFont.align }
       );
    
    yPos += 35;
    
    // If package booking, list all services in the package
    if (booking.package_id && packageServices.length > 0) {
      const servicesLabelFont = getFontAndAlign(false);
      doc.fillColor('#666666')
         .fontSize(11)
         .font(servicesLabelFont.font)
         .text(
           getText('Included Services:', 'الخدمات المشمولة:'),
           margin + 15,
           yPos,
           { width: contentWidth - 30, align: servicesLabelFont.align }
         );
      yPos += 18;
      
      const serviceItemFont = getFontAndAlign(false);
      packageServices.forEach((svc, index) => {
        const serviceDisplayName = getText(svc.name, svc.name_ar);
        doc.fillColor('#555555')
           .fontSize(10)
           .font(serviceItemFont.font)
           .text(
             `• ${serviceDisplayName}`,
             margin + 25,
             yPos,
             { width: contentWidth - 40, align: serviceItemFont.align }
           );
        yPos += 15;
      });
      
      yPos += 5; // Extra spacing after services list
    }
    
    // Date & Time section with better formatting
    const formattedDate = formatDate(booking.slot_date, language);
    const formattedStartTime = formatTime(booking.start_time);
    const formattedEndTime = formatTime(booking.end_time);
    
    const dateTimeLabelFont = getFontAndAlign(true);
    doc.fillColor('#34495E')
       .fontSize(10)
       .font(dateTimeLabelFont.font)
       .text(getText('DATE & TIME', 'التاريخ والوقت'), margin + 15, yPos, {
         align: dateTimeLabelFont.align,
         width: contentWidth - 30
       });
    
    yPos += 18;
    const dateTimeFont = getFontAndAlign(false);
    doc.fillColor('#2C3E50')
       .fontSize(11)
       .font(dateTimeFont.font)
       .text(`${formattedDate}`, margin + 15, yPos, {
         align: dateTimeFont.align,
         width: contentWidth - 30
       });
    
    yPos += 16;
    doc.font(dateTimeFont.font)
       .text(`${formattedStartTime} - ${formattedEndTime}`, margin + 15, yPos, {
         align: dateTimeFont.align,
         width: contentWidth - 30
       });
    
    yPos += 30;
    
    // Ticket Type section - Show individual ticket type (Adult or Child)
    let ticketTypeDisplay = '';
    let ticketTypeLabel = getText('TICKET TYPE', 'نوع التذكرة');
    
    // Explicitly check for 'adult' and 'child' strings (case-insensitive)
    const normalizedTicketType = ticketType?.toLowerCase();
    
    if (normalizedTicketType === 'adult') {
      ticketTypeDisplay = getText('Adult', 'كبار');
    } else if (normalizedTicketType === 'child') {
      ticketTypeDisplay = getText('Child', 'أطفال');
    } else {
      // Fallback: show total counts if ticket type not specified
      // This should not happen when generating individual tickets
      const adultCount = booking.adult_count ?? 0;
      const childCount = booking.child_count ?? 0;
      if (adultCount > 0 && childCount > 0) {
        ticketTypeDisplay = getText(
          `${adultCount} Adult + ${childCount} Child`,
          `${adultCount} كبار + ${childCount} أطفال`
        );
      } else if (adultCount > 0) {
        ticketTypeDisplay = getText(
          `${adultCount} Adult`,
          `${adultCount} كبار`
        );
      } else if (childCount > 0) {
        ticketTypeDisplay = getText(
          `${childCount} Child`,
          `${childCount} أطفال`
        );
      } else {
        ticketTypeDisplay = getText(
          `${booking.visitor_count} Visitor${booking.visitor_count > 1 ? 's' : ''}`,
          `${booking.visitor_count} زائر`
        );
      }
    }
    
    const ticketTypeLabelFont = getFontAndAlign(true);
    doc.fillColor('#34495E')
       .fontSize(10)
       .font(ticketTypeLabelFont.font)
       .text(ticketTypeLabel, margin + 15, yPos, {
         align: ticketTypeLabelFont.align,
         width: contentWidth - 30
       });
    
    yPos += 18;
    const ticketTypeDisplayFont = getFontAndAlign(false);
    doc.fillColor('#2C3E50')
       .fontSize(11)
       .font(ticketTypeDisplayFont.font)
       .text(ticketTypeDisplay, margin + 15, yPos, {
         align: ticketTypeDisplayFont.align,
         width: contentWidth - 30
       });
    
    yPos = eventBoxY + eventBoxHeight + 25;

    // ============================================
    // CUSTOMER INFO AND PRICE SECTION
    // ============================================
    const infoBoxY = yPos;
    const infoBoxHeight = 100;
    
    // Info box background
    doc.rect(margin, infoBoxY, contentWidth, infoBoxHeight)
       .fill('#FFFFFF')
       .stroke('#E1E8ED')
       .lineWidth(1);
    
    // Left column: Customer Info
    const leftColX = margin + 15;
    const rightColX = margin + contentWidth / 2 + 10;
    
    const customerLabelFont = getFontAndAlign(true);
    doc.fillColor('#34495E')
       .fontSize(10)
       .font(customerLabelFont.font)
       .text(getText('CUSTOMER NAME', 'اسم العميل'), leftColX, infoBoxY + 15, {
         align: customerLabelFont.align,
         width: contentWidth / 2 - 25
       });
    
    const customerNameFont = getFontAndAlign(false);
    doc.fillColor('#2C3E50')
       .fontSize(11)
       .font(customerNameFont.font)
       .text(booking.customer_name, leftColX, infoBoxY + 32, { 
         width: contentWidth / 2 - 25,
         align: customerNameFont.align
       });
    
    // Right column: Price (individual ticket price)
    const displayPrice = individualTicketPrice || (typeof booking.total_price === 'number' 
      ? booking.total_price 
      : parseFloat(String(booking.total_price || 0)));
    
    const priceLabelFont = getFontAndAlign(true);
    doc.fillColor('#34495E')
       .fontSize(10)
       .font(priceLabelFont.font)
       .text(getText('PRICE', 'السعر'), rightColX, infoBoxY + 15, {
         align: priceLabelFont.align,
         width: contentWidth / 2 - 25
       });
    
    // Price using primary color
    const priceFont = getFontAndAlign(true);
    doc.fillColor(primaryColor)
       .fontSize(16)
       .font(priceFont.font)
       .text(`${displayPrice.toFixed(2)} ${getText('SAR', 'ريال')}`, rightColX, infoBoxY + 32, {
         align: priceFont.align,
         width: contentWidth / 2 - 25
       });
    
    // Special Instructions (removed dummy data - only show if needed)
    // Note: Removed hardcoded instruction text as it's not part of booking data
    
    yPos = infoBoxY + infoBoxHeight + 25;

    // ============================================
    // CUT LINE - Clear mark for cutting (before QR section)
    // ============================================
    const cutLineY = yPos;
    
    // Dashed cut line across the page
    const dashLength = 10;
    const gapLength = 5;
    let currentX = margin;
    
    doc.strokeColor('#FF0000') // Red color for visibility
       .lineWidth(2);
    
    while (currentX < pageWidth - margin) {
      doc.moveTo(currentX, cutLineY)
         .lineTo(Math.min(currentX + dashLength, pageWidth - margin), cutLineY)
         .stroke();
      currentX += dashLength + gapLength;
    }
    
    // Cut instruction text
    const cutFont = getFontAndAlign(true);
    doc.fillColor('#FF0000')
       .fontSize(10)
       .font(cutFont.font)
       .text(
         getText('✂️ CUT HERE', '✂️ قص هنا / CUT HERE'),
         pageWidth / 2 - 50,
         cutLineY + 8,
         { width: 100, align: 'center' }
       );
    
    // Additional cut marks on sides
    const cutMarkSize = 15;
    const cutMarkY = cutLineY - cutMarkSize / 2;
    
    // Left cut mark (triangle pointing up)
    doc.polygon([margin, cutMarkY], [margin + cutMarkSize, cutMarkY], [margin + cutMarkSize / 2, cutMarkY + cutMarkSize])
       .fill('#FF0000');
    
    // Right cut mark (triangle pointing up)
    doc.polygon([pageWidth - margin, cutMarkY], [pageWidth - margin - cutMarkSize, cutMarkY], [pageWidth - margin - cutMarkSize / 2, cutMarkY + cutMarkSize])
       .fill('#FF0000');
    
    yPos = cutLineY + 35; // Space after cut line

    // ============================================
    // QR CODE AND ORDER INFO SECTION - Enhanced
    // ============================================
    const qrSectionY = yPos;
    const qrSize = 140;
    const sectionHeight = qrSize + 60;
    
    // Section box background
    doc.rect(margin, qrSectionY, contentWidth, sectionHeight)
       .fill('#F8F9FA')
       .stroke('#E1E8ED')
       .lineWidth(1);
    
    const sectionStartY = qrSectionY + 15;
    const leftSectionWidth = 200;
    const rightSectionWidth = contentWidth - leftSectionWidth - 50; // 50 for barcode space
    
    // Left side: QR Code with label
    const qrLabelFont = getFontAndAlign(true);
    doc.fillColor('#2C3E50')
       .fontSize(11)
       .font(qrLabelFont.font)
       .text(getText('QR CODE', 'رمز الاستجابة السريعة'), margin + 15, sectionStartY, {
         align: qrLabelFont.align,
         width: leftSectionWidth
       });
    
    const qrX = margin + 15;
    const qrY = sectionStartY + 20;
    
    // QR code with border using primary color
    doc.rect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10)
       .fill('#FFFFFF')
       .stroke(primaryColor)
       .lineWidth(2);
    
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    
    // QR code instruction
    const qrInstructionFont = getFontAndAlign(false);
    doc.fillColor('#7F8C8D')
       .fontSize(8)
       .font(qrInstructionFont.font)
       .text(
         getText('Scan to verify', 'امسح للتحقق'),
         qrX + qrSize / 2 - 20,
         qrY + qrSize + 5,
         { width: 40, align: 'center' }
       );
    
    // Right side: Ticket Information box (replaced Order Information)
    const ticketInfoX = margin + leftSectionWidth + 20;
    
    const ticketInfoLabelFont = getFontAndAlign(true);
    doc.fillColor('#2C3E50')
       .fontSize(11)
       .font(ticketInfoLabelFont.font)
       .text(getText('TICKET INFORMATION', 'معلومات التذكرة'), ticketInfoX, sectionStartY, {
         align: ticketInfoLabelFont.align,
         width: rightSectionWidth - 30
       });
    
    // Divider under title using primary color
    doc.moveTo(ticketInfoX, sectionStartY + 15)
       .lineTo(ticketInfoX + rightSectionWidth - 30, sectionStartY + 15)
       .strokeColor(primaryColor)
       .lineWidth(1)
       .stroke();
    
    yPos = sectionStartY + 30;
    
    // Ticket details with labels
    const ticketDetailLabelFont = getFontAndAlign(true);
    doc.fillColor('#34495E')
       .fontSize(9)
       .font(ticketDetailLabelFont.font)
       .text(getText('Ticket #:', 'رقم التذكرة:'), ticketInfoX, yPos, {
         align: ticketDetailLabelFont.align,
         width: rightSectionWidth - 30
       });
    
    const ticketNumberDisplay = ticketNumber && totalTickets 
      ? `${ticketNumber}/${totalTickets}`
      : booking.id.substring(0, 8).toUpperCase();
    
    const ticketDetailValueFont = getFontAndAlign(false);
    doc.fillColor('#2C3E50')
       .fontSize(10)
       .font(ticketDetailValueFont.font)
       .text(ticketNumberDisplay, ticketInfoX, yPos + 12, {
         align: ticketDetailValueFont.align,
         width: rightSectionWidth - 30
       });
    
    yPos += 20;
    doc.fillColor('#34495E')
       .fontSize(9)
       .font(ticketDetailLabelFont.font)
       .text(getText('Ticket Type:', 'نوع التذكرة:'), ticketInfoX, yPos, {
         align: ticketDetailLabelFont.align,
         width: rightSectionWidth - 30
       });
    
    // Explicitly check for 'adult' and 'child' strings (case-insensitive)
    const normalizedTicketTypeForDisplay = ticketType?.toLowerCase();
    const displayTicketType = normalizedTicketTypeForDisplay === 'adult'
      ? getText('Adult', 'كبار')
      : normalizedTicketTypeForDisplay === 'child'
      ? getText('Child', 'أطفال')
      : getText('General', 'عام');
    
    doc.fillColor('#2C3E50')
       .fontSize(10)
       .font(ticketDetailValueFont.font)
       .text(displayTicketType, ticketInfoX, yPos + 12, {
         align: ticketDetailValueFont.align,
         width: rightSectionWidth - 30
       });
    
    yPos += 20;
    doc.fillColor('#34495E')
       .fontSize(9)
       .font(ticketDetailLabelFont.font)
       .text(getText('Price:', 'السعر:'), ticketInfoX, yPos, {
         align: ticketDetailLabelFont.align,
         width: rightSectionWidth - 30
       });
    
    doc.fillColor('#2C3E50')
       .fontSize(10)
       .font(ticketDetailValueFont.font)
       .text(`${individualTicketPrice.toFixed(2)} ${getText('SAR', 'ريال')}`, ticketInfoX, yPos + 12, {
         align: ticketDetailValueFont.align,
         width: rightSectionWidth - 30
       });
    
    yPos += 25;
    const ticketInstructionFont = getFontAndAlign(false);
    doc.fillColor('#7F8C8D')
       .fontSize(8)
       .font(ticketInstructionFont.font)
       .text(
         language === 'ar' 
           ? 'يرجى إحضار هذه التذكرة عند الوصول'
           : 'Please bring this ticket upon arrival',
         ticketInfoX,
         yPos,
         { width: rightSectionWidth - 30, align: ticketInstructionFont.align }
       );
    
    // Right edge: Vertical Barcode
    const barcodeX = pageWidth - margin - 35;
    const barcodeY = sectionStartY + 10;
    const barcodeHeight = qrSize + 20;
    
    if (barcodeBuffer.length > 0) {
      // Barcode background
      doc.rect(barcodeX - 5, barcodeY - 5, 30, barcodeHeight + 10)
         .fill('#FFFFFF')
         .stroke('#E1E8ED')
         .lineWidth(1);
      
      // Rotate barcode 90 degrees
      doc.save();
      doc.translate(barcodeX, barcodeY + barcodeHeight);
      doc.rotate(-90);
      doc.image(barcodeBuffer, 0, 0, { width: barcodeHeight, height: 25 });
      doc.restore();
      
      // Barcode number below (displayed vertically)
      const barcodeNumber = booking.id.replace(/-/g, '').substring(0, 10);
      const barcodeFont = getFontAndAlign(true);
      doc.fillColor('#2C3E50')
         .fontSize(7)
         .font(barcodeFont.font);
      
      // Draw each digit vertically
      let digitY = barcodeY + barcodeHeight + 8;
      for (let i = 0; i < barcodeNumber.length; i++) {
        doc.save();
        doc.translate(barcodeX + 12, digitY);
        doc.rotate(-90);
        doc.text(barcodeNumber[i], 0, 0);
        doc.restore();
        digitY += 7;
      }
    }

    yPos = qrSectionY + sectionHeight + 25;

    // ============================================
    // FOOTER - Using tenant colors
    // ============================================
    // Footer background
    const footerY = yPos;
    const footerHeight = 50;
    
    doc.rect(0, footerY, pageWidth, footerHeight)
       .fill('#ECF0F1');
    
    // Top border using primary color
    doc.rect(0, footerY, pageWidth, 2)
       .fill(primaryColor);
    
    yPos = footerY + 15;
    
    // Tenant name
    const tenantNameFont = getFontAndAlign(true);
    const tenantDisplayName = getText(
      booking.tenant_name || 'Tenant',
      booking.tenant_name_ar
    );
    doc.fillColor('#2C3E50')
       .fontSize(12)
       .font(tenantNameFont.font)
       .text(
         tenantDisplayName,
         margin,
         yPos,
         {
           align: tenantNameFont.align,
           width: contentWidth
         }
       );
    
    // Booking ID in footer (small, bottom right)
    const bookingIdFont = getFontAndAlign(false);
    doc.fillColor('#95A5A6')
       .fontSize(7)
       .font(bookingIdFont.font)
       .text(
         `ID: ${booking.id.substring(0, 8).toUpperCase()}`,
         pageWidth - margin - 80,
         footerY + footerHeight - 15,
         { width: 80, align: 'right' }
       );

    // Finalize PDF
    doc.end();

    // Wait for PDF to be generated
    return pdfPromise;
  } catch (error: any) {
    console.error('Error generating PDF ticket:', error);
    throw new Error(`Failed to generate PDF ticket: ${error.message}`);
  }
}

/**
 * Generate PDF ticket and return as base64 string (for WhatsApp/Email)
 */
/**
 * Generate PDF ticket and return as base64 string (for WhatsApp/Email)
 * This function generates all tickets in one PDF (for multiple tickets)
 */
export async function generateBookingTicketPDFBase64(
  bookingId: string, 
  language: 'en' | 'ar' = 'en'
): Promise<string> {
  try {
    console.log(`📄 Generating PDF for booking ${bookingId}...`);
    const pdfBuffer = await generateAllTicketsInOnePDF(bookingId, language);
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }
    const base64 = pdfBuffer.toString('base64');
    console.log(`✅ PDF generated successfully for booking ${bookingId} (${pdfBuffer.length} bytes, base64: ${base64.length} chars)`);
    return base64;
  } catch (error: any) {
    console.error(`❌ Error in generateBookingTicketPDFBase64 for booking ${bookingId}:`, error);
    throw error; // Re-throw to let caller handle it
  }
}

/**
 * Generate a single PDF file containing all tickets (one page per ticket)
 */
export async function generateAllTicketsInOnePDF(
  bookingId: string,
  language: 'en' | 'ar' = 'en'
): Promise<Buffer> {
  try {
    console.log(`📄 generateAllTicketsInOnePDF: Starting for booking ${bookingId}`);
    
    // Fetch booking details to get adult_count and child_count
    const bookingResult = await query(
      `SELECT 
        visitor_count, adult_count, child_count,
        service_id, offer_id
      FROM bookings WHERE id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      throw new Error(`Booking ${bookingId} not found in database`);
    }

    const booking = bookingResult.rows[0];
    const adultCount = booking.adult_count || 0;
    const childCount = booking.child_count || 0;
    const visitorCount = booking.visitor_count || 1;

    console.log(`📄 Booking details: ${adultCount} adults, ${childCount} children, ${visitorCount} total visitors`);

    // If only one ticket, generate single ticket
    if (visitorCount === 1) {
      // Determine ticket type
      const ticketType = adultCount > 0 ? 'adult' : 'child';
      console.log(`📄 Generating single ticket (type: ${ticketType})`);
      return await generateBookingTicketPDF(bookingId, language, 1, 1, ticketType);
    }

    // Generate all tickets in one PDF (multiple pages)
    // Generate separate tickets for adults and children
    console.log(`📄 Generating multiple tickets: ${adultCount} adult + ${childCount} child`);
    const result = await generateMultipleTicketsInOnePDF(bookingId, language, adultCount, childCount);
    console.log(`✅ generateAllTicketsInOnePDF: Completed for booking ${bookingId} (${result.length} bytes)`);
    return result;
  } catch (error: any) {
    console.error(`❌ Error generating all tickets PDF for booking ${bookingId}:`, error);
    console.error('Error stack:', error.stack);
    throw new Error(`Failed to generate all tickets PDF: ${error.message}`);
  }
}

/**
 * Generate multiple tickets in a single PDF file (one page per ticket)
 * This function creates a single PDF with multiple pages, each page being one ticket
 * Generates separate tickets for adults and children with their individual prices
 */
async function generateMultipleTicketsInOnePDF(
  bookingId: string,
  language: 'en' | 'ar',
  adultCount: number,
  childCount: number
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib');
  
  // Fetch service prices to calculate individual ticket prices
  const bookingResult = await query(
    `SELECT 
      b.service_id, b.offer_id,
      s.base_price, s.child_price
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    WHERE b.id = $1`,
    [bookingId]
  );
  
  let adultPrice: number | undefined;
  let childPrice: number | undefined;
  
  if (bookingResult.rows.length > 0) {
    const booking = bookingResult.rows[0];
    
    // Get offer price if offer is selected
    if (booking.offer_id) {
      const offerResult = await query(
        `SELECT price FROM service_offers WHERE id = $1`,
        [booking.offer_id]
      );
      if (offerResult.rows.length > 0) {
        adultPrice = parseFloat(String(offerResult.rows[0].price));
      }
    }
    
    // Use base_price if offer price not available
    if (!adultPrice && booking.base_price) {
      adultPrice = parseFloat(String(booking.base_price));
    }
    
    // Child price
    if (booking.child_price) {
      childPrice = parseFloat(String(booking.child_price));
    } else {
      // If no child price, use adult price
      childPrice = adultPrice;
    }
  }
  
  const totalTickets = adultCount + childCount;
  
  // Create a new PDF document to combine all tickets
  const combinedPdf = await PDFDocument.create();
  
  let ticketNumber = 1;
  
  // Generate adult tickets
  for (let i = 0; i < adultCount; i++) {
    const ticketBuffer = await generateBookingTicketPDF(
      bookingId, 
      language, 
      ticketNumber, 
      totalTickets, 
      'adult' as 'adult', // Explicitly type as 'adult'
      adultPrice
    );
    const ticketPdf = await PDFDocument.load(ticketBuffer);
    
    const ticketPageCount = ticketPdf.getPageCount();
    if (ticketPageCount > 0) {
      const [copiedPage] = await combinedPdf.copyPages(ticketPdf, [0]);
      combinedPdf.addPage(copiedPage);
    }
    ticketNumber++;
  }
  
  // Generate child tickets
  for (let i = 0; i < childCount; i++) {
    const ticketBuffer = await generateBookingTicketPDF(
      bookingId, 
      language, 
      ticketNumber, 
      totalTickets, 
      'child' as 'child', // Explicitly type as 'child'
      childPrice
    );
    const ticketPdf = await PDFDocument.load(ticketBuffer);
    
    const ticketPageCount = ticketPdf.getPageCount();
    if (ticketPageCount > 0) {
      const [copiedPage] = await combinedPdf.copyPages(ticketPdf, [0]);
      combinedPdf.addPage(copiedPage);
    }
    ticketNumber++;
  }
  
  // Save the combined PDF
  const pdfBytes = await combinedPdf.save();
  return Buffer.from(pdfBytes);
}
