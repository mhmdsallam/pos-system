const menuData = [
  {
    category: "مشويات",
    icon: "Utensils", // اسم الايقونة من مكتبة Lucide
    color: "#ef4444", // لون القسم
    products: [
      { name: "كباب وكفتة", price: 180, description: "نصف كيلو مشكل" },
      { name: "شيش طاووق", price: 120, description: "وجبة فردية مع أرز" },
      { name: "ريش ضاني", price: 250, description: "3 قطع مع خضار سوتيه" },
    ],
  },
  {
    category: "مقبلات",
    icon: "Salad",
    color: "#22c55e",
    products: [
      { name: "سلطة خضراء", price: 15, description: "طماطم، خيار، خس" },
      { name: "طحينة", price: 10, description: "سلطة طحينة بالزبادي" },
      { name: "بابا غنوج", price: 15, description: "باذنجان مشوي" },
    ],
  },
  {
    category: "مشروبات",
    icon: "Coffee",
    color: "#3b82f6",
    products: [
      { name: "بيبسي", price: 15, description: "كانز 330 مل" },
      { name: "مياه معدنية", price: 5, description: "صغيرة" },
      { name: "شاي", price: 10, description: "كشري أو فتلة" },
    ],
  },
];

module.exports = menuData;
