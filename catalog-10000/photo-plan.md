# VORQON — خطة صور حقيقية للكتالوج (مسودة بحث، 2026-11-18)

## القاعدة
- الصور **حقيقية فوتوغرافية فقط**، ليست مولّدة بالذكاء الاصطناعي ولا مصنّعة، وبأسلوب عرض أمازون: منتج واضح على خلفية بيضاء، إضاءة وزاوية احترافية.
- **لا** تُستخدم صور أمازون نفسها ولا أي ملفات محمية لمتاجر أخرى. لقطات تجريبية من image-search بتاريخ 2026-11-18 أظهرت صوراً تحمل علامات تجارية (مثال: غلاية Sage، سماعات LogiLink) — هذه **مرفوضة** لإعادة الاستخدام.
- المصادر المقبولة: صور مفتوحة الترخيص (Openverse / Unsplash / Pexels / Wikimedia Commons مع إثبات الترخيص لكل صورة)، أو صور يرفعها مورد/بائع حقيقي.
- التحقق لكل صورة قبل القبول: ملف صورة حقيقي (JPEG/PNG/WEBP)، الضلع الطويل ≥ ~1000px، الموضوع مطابق لنوع المنتج، بلا علامة مائية وبلا علامة تجارية ظاهرة، وتُحفظ نسخة محلية في المتجر لا رابطاً خارجياً (hotlink).

## لماذا 210 وليس 10000؟
- الكتالوج المولّد في `generate_catalog.py` (بذرة 42) يتكون من **210 أنواع منتجات أساسية** فقط، تتكرر بأسماء/علامات/صفات مختلفة لتكوين 10000 منتج.
- الوضع الحالي: 12 صورة حقيقية فقط في `client/src/assets/` للمنتجات الـ12 الافتتاحية، والـ10000 الجديدة `imageKey: ""` فتظهر بأيقونة 🛍️ (انظر `ProductImage` في `client/src/App.tsx`).
- تعيين صورة واحدة حقيقية لكل نوع أساسي يغطي **كل الـ10000 منتج** بصورة مطابقة لنوعه، دون اختلاق 10000 صورة فريدة.

## مراحل مقترحة (قرار المستخدم)
- **أ: أبطال الأقسام (18 صورة)** — صورة واحدة لكل قسم، فيزول الأيقونة من صفحات التصفح أولاً، بأقل جهد.
- **ب: الأنواع الأكثر استهلاكاً (72 صورة)** — كل أنواع البقالة (20) + الصحة والجمال (18) + المنزل والمطبخ (18) + الإلكترونيات (16)، أي الأقسام الأكبر.
- **ج: كل الأنواع (210 صور)** — تغطية كاملة لكل نوع أساسي في الكتالوج.

## الأنواع الـ210 (من المولّد، مرتبة حسب القسم)

### grocery — 1500 منتجاً، 20 نوعاً
- 1. أرز أبيض / White Rice
- 2. سكر أبيض / White Sugar
- 3. زيت طعام / Cooking Oil
- 4. شاي أسود / Black Tea
- 5. قهوة مطحونة / Ground Coffee
- 6. معكرونة / Pasta
- 7. دقيق قمح / Wheat Flour
- 8. عدس أصفر / Yellow Lentils
- 9. فول مدمس / Fava Beans
- 10. جبنة بيضاء / White Cheese
- 11. لبن بودرة / Powdered Milk
- 12. عسل نحل / Honey
- 13. تمر سكري / Dates
- 14. مكسرات مشكلة / Mixed Nuts
- 15. صلصة طماطم / Tomato Paste
- 16. ملح طعام / Table Salt
- 17. خل أبيض / White Vinegar
- 18. شوفان / Oats
- 19. بسكويت سادة / Plain Biscuits
- 20. مربى فراولة / Strawberry Jam

### beauty — 1000 منتجاً، 18 نوعاً
- 21. شامبو للشعر / Hair Shampoo
- 22. بلسم للشعر / Hair Conditioner
- 23. صابون طبيعي / Natural Soap
- 24. معجون أسنان / Toothpaste
- 25. كريم مرطب / Moisturizing Cream
- 26. لوشن للجسم / Body Lotion
- 27. عطر شرقي / Oriental Perfume
- 28. مزيل عرق / Deodorant
- 29. غسول للوجه / Face Wash
- 30. زيت أرغان / Argan Oil
- 31. كريم واقي شمس / Sunscreen Cream
- 32. ماسك للوجه / Face Mask
- 33. فرشاة أسنان / Toothbrush
- 34. شاور جل / Shower Gel
- 35. زيت جوز هند / Coconut Oil
- 36. كريم لليدين / Hand Cream
- 37. تونر للبشرة / Skin Toner
- 38. سيروم فيتامين سي / Vitamin C Serum

### home-kitchen — 1000 منتجاً، 18 نوعاً
- 39. مسحوق غسيل / Laundry Detergent
- 40. سائل غسيل أطباق / Dishwashing Liquid
- 41. منظف متعدد الاستخدامات / Multi-Purpose Cleaner
- 42. إسفنجة تنظيف / Cleaning Sponge
- 43. ممسحة أرضيات / Floor Mop
- 44. مقلاة غير لاصقة / Non-Stick Frying Pan
- 45. طقم أواني طهي / Cookware Set
- 46. أطباق سيراميك / Ceramic Plates
- 47. أكواب زجاجية / Glass Cups
- 48. علب تخزين طعام / Food Storage Boxes
- 49. مناديل مطبخ / Kitchen Towels
- 50. منظف زجاج / Glass Cleaner
- 51. مبيض ملابس / Fabric Bleach
- 52. معطر جو / Air Freshener
- 53. صينية خبز / Baking Tray
- 54. سكين مطبخ / Kitchen Knife
- 55. لوح تقطيع / Cutting Board
- 56. ترمس حراري / Thermal Flask

### fashion — 900 منتجاً، 16 نوعاً
- 57. تيشيرت قطن / Cotton T-Shirt
- 58. بنطلون جينز / Denim Jeans
- 59. فستان صيفي / Summer Dress
- 60. حذاء رياضي / Sports Shoes
- 61. قميص كلاسيك / Classic Shirt
- 62. جاكيت خفيف / Light Jacket
- 63. عباية عملية / Practical Abaya
- 64. حجاب قطن / Cotton Hijab
- 65. سنيكرز يومي / Everyday Sneakers
- 66. صندل صيفي / Summer Sandals
- 67. بدلة رجالي / Men Suit
- 68. بلوزة نسائية / Women Blouse
- 69. شورت رياضي / Sports Shorts
- 70. هودي قطن / Cotton Hoodie
- 71. تنورة / Skirt
- 72. حذاء جلد / Leather Shoes

### electronics — 800 منتجاً، 16 نوعاً
- 73. سماعات بلوتوث / Bluetooth Headphones
- 74. شاحن سريع / Fast Charger
- 75. كابل شحن / Charging Cable
- 76. باور بانك / Power Bank
- 77. سماعة محمولة / Portable Speaker
- 78. ساعة ذكية / Smart Watch
- 79. كاميرا مراقبة / Security Camera
- 80. راوتر واي فاي / Wi-Fi Router
- 81. لوحة مفاتيح لاسلكية / Wireless Keyboard
- 82. ماوس لاسلكي / Wireless Mouse
- 83. فلاشة USB / USB Flash Drive
- 84. هارد خارجي / External Hard Drive
- 85. شاشة كمبيوتر / Computer Monitor
- 86. طابعة منزلية / Home Printer
- 87. سماعات أذن لاسلكية / Wireless Earbuds
- 88. مروحة USB / USB Fan

### appliances — 700 منتجاً، 14 نوعاً
- 89. خلاط كهربائي / Electric Blender
- 90. غلاية كهربائية / Electric Kettle
- 91. مكواة بخار / Steam Iron
- 92. مكنسة كهربائية / Vacuum Cleaner
- 93. مروحة عمودية / Standing Fan
- 94. دفاية كهربائية / Electric Heater
- 95. ماكينة قهوة / Coffee Machine
- 96. محضر طعام / Food Processor
- 97. فرن كهربائي / Electric Oven
- 98. ميكروويف / Microwave Oven
- 99. ثلاجة صغيرة / Mini Fridge
- 100. غسالة أطباق صغيرة / Mini Dishwasher
- 101. مضرب بيض / Egg Beater
- 102. توستر خبز / Bread Toaster

### computers — 500 منتجاً، 12 نوعاً
- 103. لابتوب عملي / Practical Laptop
- 104. لوحة مفاتيح ميكانيكية / Mechanical Keyboard
- 105. ماوس ألعاب / Gaming Mouse
- 106. سماعة رأس للألعاب / Gaming Headset
- 107. شاشة ألعاب / Gaming Monitor
- 108. ذاكرة RAM / RAM Memory
- 109. قرص SSD / SSD Drive
- 110. حقيبة لابتوب / Laptop Bag
- 111. قاعدة تبريد لابتوب / Laptop Cooling Pad
- 112. كاميرا ويب / Webcam
- 113. ميكروفون احترافي / Professional Microphone
- 114. طابعة ليزر / Laser Printer

### toys — 500 منتجاً، 12 نوعاً
- 115. مكعبات بناء / Building Blocks
- 116. دمية قماشية / Cloth Doll
- 117. سيارة لعبة / Toy Car
- 118. لعبة ألغاز / Puzzle Game
- 119. طقم تلوين / Coloring Set
- 120. كرة قدم للأطفال / Kids Football
- 121. دراجة أطفال / Kids Bicycle
- 122. لعبة تعليمية / Educational Toy
- 123. طائرة لعبة / Toy Plane
- 124. مطبخ لعبة / Toy Kitchen
- 125. قطار خشبي / Wooden Train
- 126. لعبة ماء / Water Toy

### tools — 450 منتجاً، 12 نوعاً
- 127. مثقاب كهربائي / Electric Drill
- 128. مفك براغي / Screwdriver Set
- 129. مطرقة / Hammer
- 130. منشار يدوي / Hand Saw
- 131. طقم مفاتيح / Wrench Set
- 132. متر قياس / Measuring Tape
- 133. سلم ألمنيوم / Aluminium Ladder
- 134. صندوق أدوات / Toolbox
- 135. مفك كهربائي / Electric Screwdriver
- 136. مثقاب لاسلكي / Cordless Drill
- 137. كماشة / Pliers
- 138. مستوى ميزان / Spirit Level

### sports — 450 منتجاً، 12 نوعاً
- 139. حذاء جري / Running Shoes
- 140. سجادة يوغا / Yoga Mat
- 141. دمبل حديد / Dumbbell
- 142. كرة قدم / Football
- 143. حقيبة رياضية / Sports Bag
- 144. زجاجة مياه رياضية / Sports Water Bottle
- 145. حبل قفز / Jump Rope
- 146. قفازات رياضية / Sports Gloves
- 147. بدلة رياضية / Tracksuit
- 148. دراجة هوائية / Bicycle
- 149. مضرب تنس / Tennis Racket
- 150. نظارة سباحة / Swimming Goggles

### furniture — 400 منتجاً، 10 نوعاً
- 151. كنبة ثلاثية / Three-Seater Sofa
- 152. كرسي مكتب / Office Chair
- 153. طاولة طعام / Dining Table
- 154. سرير خشبي / Wooden Bed
- 155. خزانة ملابس / Wardrobe
- 156. رف كتب / Bookshelf
- 157. طاولة قهوة / Coffee Table
- 158. مرتبة سرير / Mattress
- 159. كرسي استرخاء / Relaxing Chair
- 160. وحدة تلفاز / TV Unit

### automotive — 400 منتجاً، 10 نوعاً
- 161. زيت محرك / Engine Oil
- 162. فلتر هواء / Air Filter
- 163. بطارية سيارة / Car Battery
- 164. إطارات سيارة / Car Tyres
- 165. ممسحة زجاج / Windshield Wiper
- 166. شمع سيارة / Car Wax
- 167. مقعد سيارة للأطفال / Child Car Seat
- 168. غطاء سيارة / Car Cover
- 169. مضخة هواء / Air Pump
- 170. كابل تشغيل بطارية / Jump Start Cable

### books — 350 منتجاً، 10 نوعاً
- 171. دفتر ملاحظات / Notebook
- 172. قلم جاف / Ballpoint Pen
- 173. ألوان خشبية / Colored Pencils
- 174. حقيبة مدرسية / School Bag
- 175. مسطرة / Ruler
- 176. ممحاة / Eraser
- 177. كتاب قصص أطفال / Kids Story Book
- 178. أجندة سنوية / Annual Agenda
- 179. ملف بلاستيكي / Plastic Folder
- 180. مقص مدرسي / School Scissors

### watches — 300 منتجاً، 6 نوعاً
- 181. ساعة يد كلاسيكية / Classic Wrist Watch
- 182. ساعة ذكية / Smart Watch
- 183. ساعة رياضية / Sports Watch
- 184. سوار ساعة جلد / Leather Watch Strap
- 185. ساعة حائط / Wall Clock
- 186. منبه مكتب / Desk Alarm Clock

### machinery — 250 منتجاً، 6 نوعاً
- 187. مضخة مياه / Water Pump
- 188. مولد كهرباء صغير / Small Generator
- 189. ماكينة لحام / Welding Machine
- 190. كمبروسر هواء / Air Compressor
- 191. منشار كهربائي / Electric Saw
- 192. ماكينة طحن / Grinding Machine

### business — 200 منتجاً، 6 نوعاً
- 193. طابعة مكتبية / Office Printer
- 194. ورق طباعة A4 / A4 Printing Paper
- 195. كرسي مكتب مريح / Ergonomic Office Chair
- 196. ماكينة تصوير صغيرة / Small Copier
- 197. حاسبة مكتبية / Desktop Calculator
- 198. ماكينة تغليف / Packaging Machine

### agriculture — 150 منتجاً، 6 نوعاً
- 199. بذور خضروات / Vegetable Seeds
- 200. سماد عضوي / Organic Fertilizer
- 201. خرطوم ري / Irrigation Hose
- 202. مقص تقليم / Pruning Shears
- 203. رشاش مياه / Water Sprinkler
- 204. قفازات زراعية / Gardening Gloves

### local — 150 منتجاً، 6 نوعاً
- 205. منتجات بلدي — عسل / Local Honey
- 206. منتجات بلدي — زيت زيتون / Local Olive Oil
- 207. حرف يدوية — سلة خوص / Handmade Wicker Basket
- 208. فخار مصري / Egyptian Pottery
- 209. سجاد يدوي صغير / Small Handmade Rug
- 210. تمر مصري / Egyptian Dates

الإجمالي: 210 نوعاً.