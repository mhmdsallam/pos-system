// === Utility Styles for Receipts ===
function getPrintStyles() {
  return `
    /* Reset & Base */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; 
      direction: rtl; 
      color: #000; 
      background: #fff;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .print-container {
      width: 78mm; /* Slightly less than 80mm to prevent overflow */
      margin: 0 auto;
      padding: 5px;
    }

    /* Utility Classes matching Receipts.jsx */
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    
    .font-bold { font-weight: 700; }
    .font-black { font-weight: 900; }
    
    .text-xs { font-size: 10px; }
    .text-sm { font-size: 12px; }
    .text-base { font-size: 14px; }
    .text-lg { font-size: 16px; }
    .text-xl { font-size: 18px; }
    .text-2xl { font-size: 22px; }
    .text-3xl { font-size: 26px; }

    /* Margins & Paddings */
    .m-0 { margin: 0; }
    .mt-1 { margin-top: 4px; }
    .mt-2 { margin-top: 8px; }
    .mt-4 { margin-top: 16px; }
    .mb-1 { margin-bottom: 4px; }
    .mb-2 { margin-bottom: 8px; }
    .mb-4 { margin-bottom: 16px; }
    .my-2 { margin-top: 8px; margin-bottom: 8px; }
    
    .p-1 { padding: 4px; }
    .p-2 { padding: 8px; }
    .px-2 { padding-left: 8px; padding-right: 8px; }
    .px-4 { padding-left: 16px; padding-right: 16px; }
    .py-1 { padding-top: 4px; padding-bottom: 4px; }
    .py-2 { padding-top: 8px; padding-bottom: 8px; }
    .pb-2 { padding-bottom: 8px; }
    .pt-1 { padding-top: 4px; }

    /* Borders */
    .border { border: 1px solid #000; }
    .border-2 { border: 2px solid #000; }
    .border-b { border-bottom: 1px solid #000; }
    .border-b-2 { border-bottom: 2px solid #000; }
    .border-t { border-top: 1px solid #000; }
    .border-dashed { border-style: dashed; }
    .border-black { border-color: #000; }
    .border-gray-400 { border-color: #9ca3af; }

    /* Flex / Display */
    .block { display: block; }
    .inline-block { display: inline-block; }
    .flex { display: flex; }
    .justify-between { justify-content: space-between; }
    .items-center { align-items: center; }
    .w-full { width: 100%; }
    .w-8 { width: 2rem; }
    .w-20 { width: 5rem; }

    /* Colors */
    .text-gray-500 { color: #6b7280; }
    .text-gray-700 { color: #374151; }
    .text-red-600 { color: #000; font-weight: bold; } /* Force black for thermal printers usually */
    .bg-black { background-color: #000; color: #fff; }
    .rounded { border-radius: 4px; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; }
    th { text-align: right; }
    td { vertical-align: top; }

    /* Print Specifics */
    @media print {
      body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
      .print-container { width: 100%; padding: 0; }
      .no-print { display: none !important; }
    }
  `;
}

// Check if running in Electron
const isElectron = !!(window.electron && window.electron.printHTML);

/**
 * Print HTML content
 */
export async function printHTML(htmlContent, options = {}) {
  const { title = "طباعة" } = options;
  const fullHTML = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>${getPrintStyles()}</style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;

  // Use Electron IPC if available
  if (isElectron) {
    try {
      const result = await window.electron.printHTML(fullHTML, title);
      return result;
    } catch (error) {
      console.error("Electron print failed:", error);
    }
  }

  // Browser fallback
  return new Promise((resolve) => {
    const printWindow = window.open("", "_blank", "width=400,height=600");
    if (!printWindow) {
      resolve({ success: false, error: "Pop-up blocked" });
      return;
    }

    printWindow.document.write(fullHTML);
    printWindow.document.close();

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
        // Optional: close after print? 
        // printWindow.close(); 
        resolve({ success: true });
      } catch (e) {
        console.error("Browser print failed:", e);
        resolve({ success: false, error: e.message });
      }
    }, 500);
  });
}

/**
 * Print a React ref's content
 */
export async function printRef(ref, options = {}) {
  if (!ref || !ref.current) {
    console.error("printRef: No ref content available");
    return { success: false, error: "No ref content" };
  }
  return printHTML(ref.current.outerHTML, options); // outerHTML to include container class if any
}

/**
 * Print the current page content
 */
export function printCurrentPage() {
  window.print();
}

/**
 * Generate kitchen receipt HTML
 */
export function generateKitchenHTML(order) {
  // Uses similar clean structure but with specific Kitchen styling
  if (!order) return "";
  
  // Re-using the styles from getPrintStyles means we can use classes here too!
  const items = Array.isArray(order.items) ? order.items : [];
  const orderNumber = order.order_number || "---";
  const tableInfo = order.order_type === 'dine_in' ? `طاولة: ${order.table_number || ''}` : 'سفري/تيك أواي';
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  const itemsRows = items.map(item => `
    <tr class="border-b border-dashed border-gray-400">
      <td class="py-2">
        <div class="text-xl font-black">${item.product_name || item.name}</div>
        ${item.variation_name ? `<div class="text-sm">(${item.variation_name})</div>` : ''}
        ${item.notes ? `<div class="text-sm font-bold mt-1">📝 ${item.notes}</div>` : ''}
      </td>
      <td class="text-center font-black text-2xl align-top pt-2">${item.quantity}</td>
    </tr>
  `).join('');

  return `
    <div class="print-container">
      <div class="text-center border-b-2 border-black pb-2 mb-2">
        <h1 class="text-2xl font-black">👨‍🍳 بون المطبخ</h1>
        <div class="flex justify-between mt-2 font-bold text-lg">
          <span>#${orderNumber}</span>
          <span>${time}</span>
        </div>
        <div class="mt-1 font-bold text-xl border-2 border-black inline-block px-2 rounded">
          ${tableInfo}
        </div>
      </div>
      
      <table class="w-full">
        <thead class="border-b-2 border-black">
          <tr>
            <th class="text-right pb-1">الصنف</th>
            <th class="text-center pb-1 w-20">العدد</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      ${order.notes ? `
        <div class="mt-4 border-2 border-black p-2 text-center">
          <div class="font-bold underline">ملاحظات الطلب:</div>
          <div class="text-xl font-black mt-1">${order.notes}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Generate shift report HTML
 */
function generateShiftReportHTML(summary, user) {
  const now = new Date().toLocaleString("en-GB", {
    timeZone: "Africa/Cairo",
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const formatCurrency = (val) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(val || 0);

  return `
    <div class="print-container text-center">
      <h2 class="text-xl font-black mb-1">تقرير إغلاق الوردية</h2>
      <p class="text-sm text-gray-700 mb-2">${now}</p>
      
      <div class="border-b-2 border-black mb-2"></div>
      
      <div class="flex justify-between mb-1 text-sm font-bold">
        <span>الكاشير:</span>
        <span>${user?.full_name || '---'}</span>
      </div>
       <div class="flex justify-between mb-2 text-sm font-bold">
        <span>عدد الطلبات:</span>
        <span>${summary.total_orders || 0}</span>
      </div>

      <div class="border-t border-dashed border-black my-2"></div>

      <!-- Sales Summary -->
      <div class="text-right">
        <div class="flex justify-between py-1 border-b border-dashed border-gray-400">
          <span>إجمالي المبيعات:</span>
          <span class="font-bold text-lg">${formatCurrency(summary.total_sales)}</span>
        </div>
        <div class="flex justify-between py-1">
          <span>نقدي (Cash):</span>
          <span>${formatCurrency(summary.cash_sales)}</span>
        </div>
        <div class="flex justify-between py-1">
          <span>فيزا (Visa):</span>
          <span>${formatCurrency(summary.visa_sales)}</span>
        </div>
      </div>

      <div class="border-t border-black my-2 border-2"></div>

      <!-- Cash Drawer -->
      <div class="text-right font-bold">
        <div class="flex justify-between py-1">
          <span>رصيد البداية:</span>
          <span>${formatCurrency(summary.starting_cash)}</span>
        </div>
        <div class="flex justify-between py-1 text-red-600">
          <span>مصروفات (-):</span>
          <span>${formatCurrency(summary.total_expenses)}</span>
        </div>
        <div class="border-t border-black my-1"></div>
        <div class="flex justify-between py-2 text-xl font-black bg-black text-white px-2 rounded mt-2">
          <span>صافي النقدية:</span>
          <span>${formatCurrency(summary.net_cash)}</span>
        </div>
      </div>

      <div class="mt-4 text-xs text-center text-gray-500">
        تم الطباعة بواسطة نظام POS
      </div>
    </div>
  `;
}

export async function printShiftReport(summary, user) {
  const html = generateShiftReportHTML(summary, user);
  // Using printHTML automatically injects the styles from getPrintStyles
  return printHTML(html, { title: "تقرير الوردية" });
}
