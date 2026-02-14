import React, { forwardRef } from 'react';
import './Receipts.css';

const Receipt = forwardRef(({ order, showKitchen = true }, ref) => {
    if (!order) return null;

    // معالجة البيانات لضمان أنها Array
    let items = [];
    try {
        if (typeof order.items === 'string') {
            items = JSON.parse(order.items);
        } else if (Array.isArray(order.items)) {
            items = order.items;
        }
    } catch (e) {
        console.error("Error parsing items:", e);
        items = [];
    }

    // تنسيق العملة
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('ar-EG', {
            style: 'currency',
            currency: 'EGP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    // تنسيق التاريخ والوقت بشكل واضح (مثال: 2024/05/20 - 09:30 م)
    // تنسيق التاريخ والوقت بشكل واضح (مثال: 20/05/2024 | 09:30 م)
    const formatDate = (dateString) => {
        if (!dateString) return '';

        let dStr = dateString;
        // معالجة توقيت SQLite (UTC) لضمان تحويله للتوقيت المحلي بشكل صحيح
        // إذا كان التنسيق "YYYY-MM-DD HH:MM:SS" بدون منطقة زمنية، نعتبره UTC
        if (typeof dateString === 'string' && !dateString.includes('Z') && !dateString.includes('T') && dateString.includes(' ')) {
            dStr = dateString.replace(' ', 'T') + 'Z';
        }

        const date = new Date(dStr);

        // التاريخ بتنسيق يوم/شهر/سنة (أرقام إنجليزية لسهولة القراءة)
        const d = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Africa/Cairo' });
        // الوقت بتنسيق 12 ساعة مع ص/م
        const t = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Cairo' });
        return `${d} | ${t}`;
    };

    return (
        <div className="print-container" ref={ref} dir="rtl">
            {/* ======================== 
                فاتورة العميل (Customer Receipt) 
               ======================== */}
            <div className="receipt customer-receipt">
                <div className="receipt-header text-center border-b-2 border-black pb-2 mb-2">
                    <h2 className="text-2xl font-black">مطعم عجلان للمشويات</h2>
                    <p className="text-sm font-bold mt-1 text-gray-700">01014698287</p>
                    <p className="text-sm font-bold mt-1 text-gray-700">{formatDate(order.created_at || new Date())}</p>
                    <h3 className="text-lg font-bold mt-1">فاتورة رقم: {order.order_number}</h3>

                    {/* نوع الطلب - تم دمجها ومنع التكرار */}
                    <div className="my-2 border-2 px-4 py-1 inline-block rounded border-black font-black text-lg">
                        {order.order_type === 'dine_in' && `📍 صالة - طاولة ${order.table_number || ''}`}
                        {order.order_type === 'takeaway' && '🏃 سفري (Takeaway)'}
                        {order.order_type === 'delivery' && '🛵 توصيل (Delivery)'}
                    </div>

                    {/* بيانات العميل - تظهر فقط إذا وجدت */}
                    {(order.customer_name || order.customer_phone || order.customer_address) && (
                        <div className="text-right text-sm mt-2 border-t border-dashed border-black pt-1">
                            {order.customer_name && <p><strong>العميل:</strong> {order.customer_name}</p>}
                            {order.customer_phone && <p><strong>الهاتف:</strong> {order.customer_phone}</p>}
                            {order.customer_address && <p><strong>العنوان:</strong> {order.customer_address}</p>}
                        </div>
                    )}
                </div>

                <div className="receipt-items mb-4">
                    <table className="w-full text-right text-sm">
                        <thead className="border-b border-black">
                            <tr>
                                <th className="py-1">الصنف</th>
                                <th className="w-8 text-center">العدد</th>
                                <th className="w-20 text-left">السعر</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => (
                                <tr key={index} className="border-b border-dashed border-gray-400">
                                    <td className="py-2">
                                        <div className="font-bold">{item.product_name || item.name}</div>
                                        {item.variation_name && <span className="text-xs block text-gray-500">({item.variation_name})</span>}
                                        {item.is_spicy === 1 && <span className="text-xs block text-red-600 font-bold">🌶 سبايسي</span>}
                                        {item.notes && <span className="text-xs block text-gray-600 mt-1 italic">* {item.notes}</span>}
                                    </td>
                                    <td className="text-center align-middle py-2 font-bold">{item.quantity}</td>
                                    <td className="text-left align-middle py-2">{formatCurrency(item.price * item.quantity)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="receipt-footer border-t-2 border-black pt-2">
                    {/* الحساب المالي */}
                    <div className="text-sm border-b border-gray-400 pb-2 mb-2">
                        {(order.discount_amount > 0 || order.delivery_fee > 0) && (
                            <div className="flex justify-between mb-1">
                                <span>المجموع الفرعي:</span>
                                <span>{formatCurrency(order.subtotal || (order.total - (order.delivery_fee || 0) + (order.discount_amount || 0)))}</span>
                            </div>
                        )}

                        {order.discount_amount > 0 && (
                            <div className="flex justify-between mb-1 text-red-600 font-bold">
                                <span>الخصم:</span>
                                <span>- {formatCurrency(order.discount_amount)}</span>
                            </div>
                        )}

                        {order.delivery_fee > 0 && (
                            <div className="flex justify-between mb-1">
                                <span>خدمة توصيل:</span>
                                <span>+ {formatCurrency(order.delivery_fee)}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between text-xl font-black mb-3 border-b-2 border-double border-black pb-1">
                        <span>الإجمالي النهائي:</span>
                        <span>{formatCurrency(order.total)}</span>
                    </div>

                    <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                            <span>طريقة الدفع:</span>
                            <span className="font-bold">
                                {order.payment_method === 'cash' ? 'نقدًا (Cash)' :
                                    order.payment_method === 'vodafone' ? 'فودافون كاش' :
                                        order.payment_method === 'instapay' ? 'انستا باي' : 'بطاقة (Card)'}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span>الكاشير:</span>
                            <span>{order.cashier_name || 'System Admin'}</span>
                        </div>
                    </div>

                    <div className="text-center text-sm font-bold mt-6">
                        <p>شكراً لزيارتكم!</p>
                        <p className="text-xs mt-1">برمجة: 01014698287</p>
                    </div>
                </div>
            </div>

            {showKitchen && (
                <>
                    {/* فاصل واضح بين فاتورة العميل وبون المطبخ */}
                    <div className="cut-separator">----- قص هنا / Kitchen -----</div>
                    <div className="page-break"></div>

                    {/* ======================== 
                بون المطبخ (Kitchen Receipt) 
               ======================== */}
                    <div className="receipt kitchen-receipt">
                        <div className="receipt-header text-center border-b-4 border-black pb-2 mb-4">
                            <h2 className="text-3xl font-black">المطبخ 👨‍🍳</h2>
                            <div className="flex justify-between items-center text-xl font-black border-4 border-black p-2 my-2">
                                <span>#{(order.order_number || '').split('-').pop() || '---'}</span>
                                <span>
                                    {order.order_type === 'dine_in' ? `صالة: ${order.table_number}` : 'طلب خارجي'}
                                </span>
                            </div>
                            <p className="text-sm font-bold">{formatDate(order.created_at)}</p>
                        </div>

                        <div className="receipt-items">
                            <table className="w-full text-right">
                                <thead className="border-b-2 border-black">
                                    <tr>
                                        <th className="py-2 text-xl">الصنف</th>
                                        <th className="w-12 text-center text-xl">العدد</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, index) => (
                                        <tr key={index} className="border-b-2 border-dashed border-gray-600">
                                            <td className="py-3">
                                                <div className="text-2xl font-bold">{item.product_name || item.name}</div>
                                                {item.variation_name && <div className="text-lg text-gray-700">➤ {item.variation_name}</div>}
                                                <div className="mt-1">
                                                    {(item.is_spicy === 1 || item.notes?.includes('سبايسي')) && (
                                                        <span className="bg-black text-white px-2 py-0.5 rounded text-lg font-bold">🌶 سبايسي</span>
                                                    )}
                                                    {item.notes && item.notes.replace('سبايسي', '').trim().length > 0 && (
                                                        <div className="text-xl font-bold mt-1">📝 {item.notes.replace('سبايسي', '').trim()}</div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="text-center align-top py-3 text-4xl font-black">{item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {order.notes && (
                            <div className="mt-6 border-4 border-black p-2 text-center">
                                <strong className="block text-xl underline">ملاحظات عامة:</strong>
                                <p className="text-2xl font-black">{order.notes}</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
});

Receipt.displayName = 'Receipt';

export default Receipt;