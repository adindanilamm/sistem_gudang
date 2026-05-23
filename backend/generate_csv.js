const fs = require('fs');

function generateEAN13(prefix) {
    let code = prefix;
    while(code.length < 12) {
        code += Math.floor(Math.random() * 10).toString();
    }
    let sum1 = 0;
    let sum3 = 0;
    for(let i=0; i<12; i++) {
        let digit = parseInt(code[i]);
        if (i % 2 === 0) sum1 += digit;
        else sum3 += digit * 3;
    }
    let total = sum1 + sum3;
    let checkDigit = (10 - (total % 10)) % 10;
    return code + checkDigit;
}

const items = [
    "Beras Premium 5kg", "Minyak Goreng 1L", "Gula Pasir 1kg", "Tepung Terigu 1kg", "Garam Dapur 250g",
    "Kecap Manis 520ml", "Saus Sambal 340ml", "Susu Kental Manis 370g", "Kopi Hitam 165g", "Teh Celup 25s",
    "Indomie Goreng", "Indomie Kuah Ayam Bawang", "Bumbu Racik Nasi Goreng", "Kaldu Sapi 100g", "Margarin 200g",
    "Keju Cheddar 165g", "Roti Tawar", "Selai Kacang 250g", "Madu Murni 350ml", "Sarden Pedas 425g",
    "Kornet Sapi 340g", "Mie Telur 200g", "Bihun Jagung 320g", "Kecap Asin 150ml", "Saus Tiram 270ml",
    "Minyak Wijen 115ml", "Lada Bubuk 50g", "Ketumbar Bubuk 50g", "Kunyit Bubuk 50g", "Jahe Bubuk 50g",
    "Bawang Putih Bubuk 50g", "Bawang Merah Goreng 100g", "Kerupuk Udang 250g", "Emping Melinjo 200g", "Kacang Tanah 500g",
    "Kacang Hijau 500g", "Kacang Kedelai 500g", "Beras Merah 1kg", "Beras Ketan 1kg", "Gula Merah 500g",
    "Santang Cair 200ml", "Sirup Cocopandan 460ml", "Air Mineral 600ml", "Minuman Isotonik 500ml", "Teh Botol 350ml",
    "Kopi Susu Botol 250ml", "Jus Jeruk 1L", "Susu UHT Full Cream 1L", "Susu UHT Coklat 1L", "Yogurt Drink 250ml"
];

let csv = "kode,nama,satuan,created_at,updated_at\n";
let date = "2026-05-10 06:50:39.000";

for(let i=0; i<500; i++) {
    let item = items[i % items.length] + (i >= items.length ? " V" + Math.floor(i/items.length) : "");
    let ean = generateEAN13("899");
    let satuan = "Pcs";
    
    if(item.includes("kg") || item.includes("g")) {
        satuan = item.includes("Beras") ? "Karung" : "Bungkus";
    } else if (item.includes("ml") || item.includes("L")) {
        satuan = "Botol";
    } else if (item.includes("s")) {
        satuan = "Pack";
    }
    
    csv += `${ean},"${item}",${satuan},${date},${date}\n`;
}

fs.writeFileSync('../data_barang_ean13.csv', csv);
console.log('CSV created with 500 rows at c:/Proejct Software/data_barang_ean13.csv');
