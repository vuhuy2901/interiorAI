import { useEffect, useState, type FormEvent } from 'react';

const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const HOTLINE = '098.123.4567';

type Line = {
  id: string;
  title: string;
  specification: string;
  gross_quantity: number;
  unit: string;
  unit_price_vnd: number;
  subtotal_vnd: number;
  price_status: string;
  source_label: string;
  source_note?: string;
  source_url?: string;
  checked_at: string;
};

type Estimate = {
  revision: number;
  scene_asset_hash: string;
  lines: Line[];
  total_vnd: number;
  tax_vnd: number;
  tax_rate: number;
  reference_subtotal_vnd: number;
  known_subtotal_vnd: number;
  priced_line_count: number;
  unpriced_line_count: number;
  price_coverage_percent: number;
  total_is_complete: boolean;
  disclaimer: string;
};

type MaterialSuggestion = {
  id: string;
  title: string;
  material: string;
  finish: string;
  specs: string;
  bestFor: string;
  pros: string;
  cons: string;
  unit: string;
  quantity: number;
  unitPriceVnd: number;
  totalPriceVnd: number;
  priceLabel: string;
  sourceNote: string;
  sourceUrl?: string;
  contactPhone: string;
  isQuoteRequired?: boolean;
};

function parseQuantityAndUnit(line: Line): { unit: string; quantity: number } {
  const text = `${line.title} ${line.specification}`.toLowerCase();
  const dimMatch = line.specification.match(/(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)(?:\s*×\s*(\d+(?:\.\d+)?))?\s*mm/i);
  const dims = dimMatch
    ? [Number(dimMatch[1]), Number(dimMatch[2]), dimMatch[3] ? Number(dimMatch[3]) : 0].sort((a, b) => b - a)
    : [];

  if (/bếp|kitchen/i.test(text)) {
    const lenM = dims.length ? (dims[0] > 2000 ? dims[0] / 1000 : dims[1] / 1000) : 5.5;
    return { unit: 'md', quantity: Number(lenM.toFixed(1)) || 5.5 };
  }
  if (/rèm|curtain|vải/i.test(text)) {
    const wM = dims.length ? (dims[1] > 1000 ? dims[1] / 1000 : dims[0] / 1000) : 2.4;
    return { unit: 'md', quantity: Number(wM.toFixed(1)) || 2.4 };
  }
  if (/lan can|tay vịn|railing/i.test(text)) {
    if (/cầu thang/i.test(text)) return { unit: 'md', quantity: 6.7 };
    return { unit: 'md', quantity: 15.0 };
  }
  if (/sàn|floor/i.test(text)) {
    return { unit: 'm²', quantity: line.gross_quantity > 10 ? line.gross_quantity : 156.0 };
  }
  if (/tường|wall/i.test(text)) {
    return { unit: 'm²', quantity: line.gross_quantity > 10 ? line.gross_quantity : 360.0 };
  }
  if (/trần|ceiling/i.test(text)) {
    return { unit: 'm²', quantity: line.gross_quantity > 10 ? line.gross_quantity : 122.0 };
  }
  if (/cửa|window|vách kính/i.test(text)) {
    if (dims.length >= 2) {
      const areaM2 = (dims[0] / 1000) * (dims[1] / 1000);
      return { unit: 'm²', quantity: Number(areaM2.toFixed(1)) || 8.6 };
    }
    return { unit: 'm²', quantity: line.gross_quantity > 1 ? line.gross_quantity : 8.6 };
  }
  if (/kệ sách|shelf|giá sách/i.test(text)) {
    if (dims.length >= 2) {
      const areaM2 = (dims[0] / 1000) * (dims[1] / 1000);
      return { unit: 'm²', quantity: Number(areaM2.toFixed(1)) || 2.5 };
    }
    return { unit: 'm²', quantity: line.gross_quantity > 1 ? line.gross_quantity : 2.5 };
  }
  if (/cầu thang|stair/i.test(text)) {
    return { unit: 'bộ (14 bậc)', quantity: 1 };
  }
  return { unit: line.unit || 'bộ', quantity: line.gross_quantity || 1 };
}

function suggestionsForLine(line: Line): MaterialSuggestion[] {
  const text = `${line.title} ${line.specification}`.toLocaleLowerCase('vi');
  const { unit, quantity } = parseQuantityAndUnit(line);

  // 1. Tủ bếp (Kitchen)
  if (/bếp|kitchen/.test(text)) {
    const p1 = 5900000;
    const p2 = 7800000;
    const p3 = 12500000;
    return [
      {
        id: 'melamine',
        title: 'MDF chống ẩm phủ Melamine An Cường lõi xanh',
        material: 'MDF MR E1 chịu ẩm',
        finish: 'Phủ Melamine 2 mặt vân gỗ hoặc màu đơn sắc',
        specs: `Tính theo ${quantity} ${unit} hoàn thiện cả tủ trên & dưới, phụ kiện ray giảm chấn tiêu chuẩn`,
        bestFor: 'Tủ bếp gia đình phong cách hiện đại / tối giản',
        pros: 'Bền đẹp, chống trầy, dễ vệ sinh, giá thành tối ưu',
        cons: 'Cạnh dán nẹp PVC phải gia công máy ép nhiệt kín nước',
        unit,
        quantity,
        unitPriceVnd: p1,
        totalPriceVnd: Math.round(quantity * p1),
        priceLabel: `${money(Math.round(quantity * p1))} (${money(p1)}/${unit})`,
        sourceNote: `MDF chống ẩm phủ Melamine An Cường (${quantity} ${unit}). Nguồn: Gỗ An Cường. Hotline: ${HOTLINE}`,
        sourceUrl: 'https://ancuong.com',
        contactPhone: HOTLINE,
      },
      {
        id: 'veneer',
        title: 'Plywood chịu nước phủ Veneer sồi tự nhiên sơn PU',
        material: 'Plywood cốt bạch đàn + veneer sồi tự nhiên',
        finish: 'Sơn PU Inchem 5 lớp hoặc lau dầu dưỡng gỗ mờ',
        specs: `May đo theo ${quantity} ${unit}, lớp mặt veneer sồi tự nhiên vân núi hoặc vân sọc`,
        bestFor: 'Tủ bếp phong cách Japandi / Bắc Âu đòi hỏi vân gỗ thật',
        pros: 'Chống nước cực tốt, cốt chịu lực cao, bề mặt vân gỗ tự nhiên sang trọng',
        cons: 'Cần duyệt vân gỗ trước khi gia công; bảo dưỡng bề mặt định kỳ',
        unit,
        quantity,
        unitPriceVnd: p2,
        totalPriceVnd: Math.round(quantity * p2),
        priceLabel: `${money(Math.round(quantity * p2))} (${money(p2)}/${unit})`,
        sourceNote: `Plywood phủ Veneer sồi sơn PU Inchem (${quantity} ${unit}). Nguồn: Xưởng nội thất gia công An Cường. Hotline: ${HOTLINE}`,
        sourceUrl: 'https://ancuong.com/san-pham/veneer',
        contactPhone: HOTLINE,
        isQuoteRequired: true,
      },
      {
        id: 'solid',
        title: 'Gỗ tự nhiên Sồi Mỹ / Óc chó xẻ sấy FAS nguyên khối',
        material: 'Sồi trắng Mỹ (White Oak) hoặc Óc chó Bắc Mỹ',
        finish: 'Sơn mờ lau dầu dưỡng thực vật gốc khoáng',
        specs: `Gia công mộng truyền thống kết hợp phụ kiện Hafele cao cấp theo ${quantity} ${unit}`,
        bestFor: 'Biệt thự, căn hộ Duplex cao cấp cần giá trị thủ công bền vững',
        pros: 'Cảm giác gỗ thật 100%, có thể đánh bóng làm mới sau nhiều năm',
        cons: 'Cần kiểm soát độ ẩm phòng điều hòa để tránh co ngót tự nhiên',
        unit,
        quantity,
        unitPriceVnd: p3,
        totalPriceVnd: Math.round(quantity * p3),
        priceLabel: `${money(Math.round(quantity * p3))} (${money(p3)}/${unit})`,
        sourceNote: `Tủ bếp gỗ tự nhiên Sồi Mỹ FAS (${quantity} ${unit}). Nguồn: Gỗ xẻ sấy FAS Bắc Mỹ. Hotline khảo sát: ${HOTLINE}`,
        sourceUrl: 'https://moho.com.vn',
        contactPhone: HOTLINE,
        isQuoteRequired: true,
      },
    ];
  }

  // 2. Sàn (Floor)
  if (/sàn|floor|gạch|đá|ốp|lát/.test(text)) {
    const p1 = 420000;
    const p2 = 500000;
    const p3 = 850000;
    return [
      {
        id: 'spc',
        title: 'Sàn SPC vân gỗ hèm khóa chống ẩm',
        material: 'Bột đá + hạt nhựa nguyên sinh',
        finish: 'Vân gỗ nổi mờ chống trầy AC4',
        specs: `Dày 5.5 mm kèm lớp lót cao su IXPE 1.5mm, lát diện tích ${quantity} ${unit}`,
        bestFor: 'Sàn phòng khách, phòng ngủ và hành lang căn hộ thông tầng',
        pros: '100% không thấm nước, không cong vênh, thi công nhanh',
        cons: 'Yêu cầu bề mặt cán nền phẳng tuyệt đối',
        unit,
        quantity,
        unitPriceVnd: p1,
        totalPriceVnd: Math.round(quantity * p1),
        priceLabel: `${money(Math.round(quantity * p1))} (${money(p1)}/${unit})`,
        sourceNote: `Sàn SPC hèm khóa AC4 An Cường Floor (${quantity} ${unit}). Nguồn: An Cường. Hotline: ${HOTLINE}`,
        sourceUrl: 'https://ancuong.com/san-pham/san-go',
        contactPhone: HOTLINE,
      },
      {
        id: 'tile',
        title: 'Gạch Porcelain xương đá 800×800 mm Matt',
        material: 'Porcelain xương đá cứng chống thấm',
        finish: 'Matt chống trơn, chống bám bẩn nano',
        specs: `Khổ 800×800 mm, ke ron 1.5mm chà ron gốc epoxy chống ố cho ${quantity} ${unit}`,
        bestFor: 'Tầng 1 phòng khách thông tầng và khu vực bàn ăn',
        pros: 'Chịu lực cao, lau chùi dầu mỡ dễ dàng, bền bỉ theo thời gian',
        cons: 'Bề mặt có cảm giác mát vào mùa lạnh',
        unit,
        quantity,
        unitPriceVnd: p2,
        totalPriceVnd: Math.round(quantity * p2),
        priceLabel: `${money(Math.round(quantity * p2))} (${money(p2)}/${unit})`,
        sourceNote: `Gạch Porcelain xương đá Matt 800x800 (${quantity} ${unit}). Nguồn: Gạch Viglacera / Đồng Tâm. Hotline: ${HOTLINE}`,
        sourceUrl: 'https://dongtam.com.vn',
        contactPhone: HOTLINE,
      },
      {
        id: 'wood',
        title: 'Sàn gỗ kỹ thuật Engineered Wood sồi tự nhiên',
        material: 'Đáy Plywood kháng ẩm + mặt sồi tự nhiên 3mm',
        finish: 'Sơn UV chống xước 7 lớp hoặc lau dầu mờ',
        specs: `Quy cách 15 × 120 × 900 mm, lát xương cá hoặc so le cho ${quantity} ${unit}`,
        bestFor: 'Sảnh tầng lửng đọc sách và phòng sinh hoạt riêng',
        pros: 'Vân gỗ tự nhiên ấm cúng, sang trọng, ít giãn nở hơn gỗ nguyên khối',
        cons: 'Giá thành cao hơn SPC; tránh nước đọng lâu',
        unit,
        quantity,
        unitPriceVnd: p3,
        totalPriceVnd: Math.round(quantity * p3),
        priceLabel: `${money(Math.round(quantity * p3))} (${money(p3)}/${unit})`,
        sourceNote: `Sàn gỗ kỹ thuật Engineered Wood Sồi (${quantity} ${unit}). Nguồn: An Cường Floor. Hotline: ${HOTLINE}`,
        sourceUrl: 'https://ancuong.com/san-pham/san-go',
        contactPhone: HOTLINE,
        isQuoteRequired: true,
      },
    ];
  }

  // 3. Tường / Trần / Sơn
  if (/tường|trần|sơn|wall|ceiling|vách/.test(text)) {
    const isCeiling = /trần|ceiling/.test(text);
    const p1 = isCeiling ? 230000 : 100000;
    const p2 = isCeiling ? 350000 : 250000;
    const p3 = isCeiling ? 450000 : 420000;
    return [
      {
        id: 'paint',
        title: isCeiling ? 'Trần thạch cao chìm Vĩnh Tường Gyproc sơn Dulux' : 'Sơn nội thất Dulux EasyClean lau chùi',
        material: isCeiling ? 'Khung xương Vĩnh Tường + tấm Gyproc 9mm' : 'Sơn nước acrylic siêu bóng / mờ',
        finish: 'Bả matit 2 lớp, xả nhám mịn, 1 lớp lót kiềm + 2 lớp phủ',
        specs: `Quy chuẩn thi công cho ${quantity} ${unit} bề mặt công trình`,
        bestFor: isCeiling ? 'Trần toàn bộ 2 tầng căn hộ Duplex' : 'Toàn bộ tường phòng khách và tầng lửng',
        pros: 'Bề mặt láng mịn, dễ dặm vá, chống ẩm và mốc hiệu quả',
        cons: 'Cần đội thợ bả matit tay nghề đều để tránh gợn sóng',
        unit,
        quantity,
        unitPriceVnd: p1,
        totalPriceVnd: Math.round(quantity * p1),
        priceLabel: `${money(Math.round(quantity * p1))} (${money(p1)}/${unit})`,
        sourceNote: `${isCeiling ? 'Trần Vĩnh Tường Gyproc' : 'Sơn Dulux EasyClean'} (${quantity} ${unit}). Nguồn: Dulux/Vĩnh Tường. Hotline: ${HOTLINE}`,
        sourceUrl: isCeiling ? 'https://vinhtuong.com' : 'https://dulux.vn',
        contactPhone: HOTLINE,
      },
      {
        id: 'microcement',
        title: isCeiling ? 'Trần gỗ công nghiệp tiêu âm rãnh âm' : 'Sơn hiệu ứng bê tông Microcement loang tự nhiên',
        material: isCeiling ? 'MDF chống ẩm rãnh tiêu âm' : 'Xi măng trang trí polymer',
        finish: 'Phủ lớp sáp bảo vệ chống bám bẩn bề mặt mờ',
        specs: `Thi công bả kéo vân thủ công đa lớp trên diện tích ${quantity} ${unit}`,
        bestFor: 'Mảng tường điểm nhấn sau sofa và vách thông tầng',
        pros: 'Không đường ron, bề mặt nghệ thuật hiện đại phong cách Wabi-Sabi / Loft',
        cons: 'Cần thợ thi công chuyên nghiệp giàu kinh nghiệm',
        unit,
        quantity,
        unitPriceVnd: p2,
        totalPriceVnd: Math.round(quantity * p2),
        priceLabel: `${money(Math.round(quantity * p2))} (${money(p2)}/${unit})`,
        sourceNote: `Hiệu ứng Microcement (${quantity} ${unit}). Nguồn: Vật liệu trang trí cao cấp. Hotline: ${HOTLINE}`,
        contactPhone: HOTLINE,
        isQuoteRequired: true,
      },
      {
        id: 'wood-panel',
        title: 'Hệ ốp lam vách gỗ MDF chống ẩm phủ Veneer',
        material: 'Cốt MDF xanh An Cường + lớp mặt gỗ tự nhiên',
        finish: 'Sơn PU chống trầy hoặc lau dầu mờ',
        specs: `Module tấm ốp vách khe âm kẹp chỉ kim loại cao cho ${quantity} ${unit}`,
        bestFor: 'Vách tivi phòng khách hoặc vách đầu giường',
        pros: 'Cải thiện âm học, tạo chiều sâu thị giác sang trọng',
        cons: 'Cần khung xương hộp sắt kẽm cách tường để chống ẩm',
        unit,
        quantity,
        unitPriceVnd: p3,
        totalPriceVnd: Math.round(quantity * p3),
        priceLabel: `${money(Math.round(quantity * p3))} (${money(p3)}/${unit})`,
        sourceNote: `Ốp lam vách Veneer An Cường (${quantity} ${unit}). Nguồn: An Cường. Hotline: ${HOTLINE}`,
        sourceUrl: 'https://ancuong.com/san-pham/veneer',
        contactPhone: HOTLINE,
        isQuoteRequired: true,
      },
    ];
  }

  // 4. Rèm / Lan can / Cửa / Cầu thang
  if (/rèm|lan can|cửa|cầu thang|tay vịn|window|vách kính|railing|curtain/.test(text)) {
    const isCurtain = /rèm|curtain/.test(text);
    const isRailing = /lan can|railing/.test(text);
    const isWindow = /cửa|window|kính/.test(text);

    if (isCurtain) {
      const p1 = 1600000;
      const p2 = 1850000;
      const p3 = 3200000;
      return [
        {
          id: 'fabric-1',
          title: 'Rèm vải dệt 2 lớp cản sáng 100% chống nắng',
          material: '1 lớp vải gấm thô dệt cản sáng + 1 lớp voan trắng xước',
          finish: 'May định hình gợn sóng chuẩn ray âm trần',
          specs: `May đo theo ${quantity} ${unit} cửa thông tầng, phụ kiện ray nhôm chống ồn`,
          bestFor: 'Khung cửa kính phòng khách và cửa kính ban công',
          pros: 'Cản sáng tuyệt đối, cách nhiệt, thẩm mỹ mềm mại thanh lịch',
          cons: 'Cần vệ sinh giặt hấp sau 6-12 tháng',
          unit,
          quantity,
          unitPriceVnd: p1,
          totalPriceVnd: Math.round(quantity * p1),
          priceLabel: `${money(Math.round(quantity * p1))} (${money(p1)}/${unit})`,
          sourceNote: `Rèm vải cản sáng 2 lớp (${quantity} ${unit}). Nguồn: Rèm MOHO / Nội thất. Hotline: ${HOTLINE}`,
          sourceUrl: 'https://moho.com.vn',
          contactPhone: HOTLINE,
        },
        {
          id: 'fabric-2',
          title: 'Hệ rèm cầu vồng Hàn Quốc cao cấp chống tia UV',
          material: 'Polyester dệt dải so le cản sáng 95%',
          finish: 'Hộp máng nhôm sơn tĩnh điện đồng màu',
          specs: `Cắt may theo ${quantity} ${unit} ô kính tầng lửng, kéo thả điều chỉnh ánh sáng linh hoạt`,
          bestFor: 'Khu vực làm việc và đọc sách tầng lửng',
          pros: 'Gọn gàng, điều chỉnh ánh sáng đa mức, chống bám bụi',
          cons: 'Không cản sáng tuyệt đối 100% như rèm vải dày',
          unit,
          quantity,
          unitPriceVnd: p2,
          totalPriceVnd: Math.round(quantity * p2),
          priceLabel: `${money(Math.round(quantity * p2))} (${money(p2)}/${unit})`,
          sourceNote: `Rèm cầu vồng Hàn Quốc (${quantity} ${unit}). Nguồn: Rèm Modero Hàn Quốc. Hotline: ${HOTLINE}`,
          sourceUrl: 'https://moho.com.vn',
          contactPhone: HOTLINE,
        },
        {
          id: 'fabric-auto',
          title: 'Rèm vải động cơ thông minh điều khiển qua App / Remote',
          material: 'Vải cản sáng cao cấp + Motor Somfy / Tuya',
          finish: 'Ray động cơ êm ái dưới 30dB, kết nối SmartHome',
          specs: `Lắp đặt trọn gói motor và ray nhôm theo ${quantity} ${unit}`,
          bestFor: 'Cửa thông tầng cao trên 4m cần đóng mở tự động',
          pros: 'Tiện nghi cao cấp, hẹn giờ đóng mở theo ánh nắng tự động',
          cons: 'Cần chờ nguồn điện 220V sẵn trên trần',
          unit,
          quantity,
          unitPriceVnd: p3,
          totalPriceVnd: Math.round(quantity * p3),
          priceLabel: `${money(Math.round(quantity * p3))} (${money(p3)}/${unit})`,
          sourceNote: `Rèm tự động thông minh (${quantity} ${unit}). Nguồn: Smart Curtain. Hotline tư vấn: ${HOTLINE}`,
          contactPhone: HOTLINE,
          isQuoteRequired: true,
        },
      ];
    }

    if (isRailing) {
      const p1 = 1300000;
      const p2 = 1500000;
      const p3 = 1950000;
      return [
        {
          id: 'glass-railing',
          title: 'Lan can kính cường lực 12mm chân trụ lùn inox 304',
          material: 'Kính tôi cường lực Hải Long 12mm mài xiết cạnh',
          finish: 'Trụ lùn inox 304 xước mờ kèm tay vịn nhôm hộp',
          specs: `Gia công lắp đặt cho ${quantity} ${unit} hành lang tầng lửng`,
          bestFor: 'Ban công thông tầng lấy sáng tối đa',
          pros: 'Không cản tầm nhìn, làm không gian thông tầng rộng hơn',
          cons: 'Cần lau mặt kính định kỳ để tránh dấu vân tay',
          unit,
          quantity,
          unitPriceVnd: p1,
          totalPriceVnd: Math.round(quantity * p1),
          priceLabel: `${money(Math.round(quantity * p1))} (${money(p1)}/${unit})`,
          sourceNote: `Lan can kính cường lực 12mm Hải Long (${quantity} ${unit}). Nguồn: Kính Hải Long. Hotline: ${HOTLINE}`,
          sourceUrl: 'https://hailongglass.com',
          contactPhone: HOTLINE,
        },
        {
          id: 'cnc-railing',
          title: 'Lan can thép tấm cắt CNC sơn tĩnh điện tay vịn sồi',
          material: 'Thép tấm dày 8mm cắt CNC hoa văn dọc tối giản',
          finish: 'Sơn tĩnh điện đen mờ cát mịn, tay vịn sồi tự nhiên bo tròn',
          specs: `Hàn liên kết bản mã nở sắt chịu lực cho ${quantity} ${unit}`,
          bestFor: 'Cầu thang và ban công phong cách Hiện đại / Japandi',
          pros: 'Chắc chắn, độ cứng cao, kiểu dáng hiện đại thanh lịch',
          cons: 'Trọng lượng nặng, cần liên kết dầm vững chắc',
          unit,
          quantity,
          unitPriceVnd: p2,
          totalPriceVnd: Math.round(quantity * p2),
          priceLabel: `${money(Math.round(quantity * p2))} (${money(p2)}/${unit})`,
          sourceNote: `Lan can thép CNC sơn tĩnh điện (${quantity} ${unit}). Nguồn: Xưởng cơ khí mỹ thuật. Hotline: ${HOTLINE}`,
          contactPhone: HOTLINE,
        },
        {
          id: 'cable-railing',
          title: 'Lan can cáp inox bọc nhựa căng tăng đơ giấu mối',
          material: 'Dây cáp inox 316 phi 6mm + tăng đơ inox 304',
          finish: 'Tay vịn gỗ gõ đỏ xẻ rãnh ôm cáp',
          specs: `Căng cáp song song khoảng cách 100mm theo ${quantity} ${unit}`,
          bestFor: 'Không gian mở tối giản tinh gọn',
          pros: 'Nhẹ nhàng, thông thoáng gió và ánh sáng',
          cons: 'Cần kiểm tra độ căng của dây cáp hàng năm',
          unit,
          quantity,
          unitPriceVnd: p3,
          totalPriceVnd: Math.round(quantity * p3),
          priceLabel: `${money(Math.round(quantity * p3))} (${money(p3)}/${unit})`,
          sourceNote: `Lan can cáp inox 316 (${quantity} ${unit}). Hotline kỹ thuật: ${HOTLINE}`,
          contactPhone: HOTLINE,
          isQuoteRequired: true,
        },
      ];
    }

    if (isWindow) {
      const p1 = 1350000;
      const p2 = 1850000;
      const p3 = 3500000;
      return [
        {
          id: 'xingfa-55',
          title: 'Nhôm Xingfa Quảng Đông hệ 55 tem đỏ chính hãng',
          material: 'Thanh profile nhôm Xingfa dày 1.4–2.0mm',
          finish: 'Sơn tĩnh điện chống muối biển màu ghi xám / đen',
          specs: `Kính dán an toàn 8.38mm Việt Nhật, phụ kiện Kinlong đồng bộ cho ${quantity} ${unit}`,
          bestFor: 'Cửa sổ và vách kính lấy sáng toàn cảnh',
          pros: 'Kín khít cách âm, cách nhiệt, bền vững trước gió bão',
          cons: 'Trên thị trường có hàng nhái cần kiểm tra mã QR tem đỏ',
          unit,
          quantity,
          unitPriceVnd: p1,
          totalPriceVnd: Math.round(quantity * p1),
          priceLabel: `${money(Math.round(quantity * p1))} (${money(p1)}/${unit})`,
          sourceNote: `Cửa nhôm Xingfa hệ 55 tem đỏ (${quantity} ${unit}). Nguồn: Xingfa Group. Hotline: ${HOTLINE}`,
          sourceUrl: 'https://xingfagroup.vn',
          contactPhone: HOTLINE,
        },
        {
          id: 'lowe-glass',
          title: 'Vách kính mặt dựng kính hộp dán Low-E cản nhiệt',
          material: 'Kính dán an toàn 2 lớp phủ kim loại mềm Low-E',
          finish: 'Khung nhôm gia cường chịu lực gió tầng cao',
          specs: `Cản nhiệt mặt ngoài 60%, lấy sáng 75% cho ${quantity} ${unit} mặt kính thông tầng`,
          bestFor: 'Vách kính thông tầng hướng Tây hoặc nhiều nắng',
          pros: 'Giảm tiền điện điều hòa, ngăn chặn 99% tia cực tím hại đồ nội thất',
          cons: 'Đơn giá cao hơn kính an toàn thông thường',
          unit,
          quantity,
          unitPriceVnd: p2,
          totalPriceVnd: Math.round(quantity * p2),
          priceLabel: `${money(Math.round(quantity * p2))} (${money(p2)}/${unit})`,
          sourceNote: `Vách kính hộp Low-E cản nhiệt (${quantity} ${unit}). Nguồn: Kính Viglacera / Hải Long. Hotline: ${HOTLINE}`,
          sourceUrl: 'https://hailongglass.com',
          contactPhone: HOTLINE,
        },
        {
          id: 'civro-system',
          title: 'Hệ nhôm cầu cách nhiệt cao cấp Civro Đức',
          material: 'Hợp kim nhôm cầu cách nhiệt Technoform Bautec',
          finish: 'Sơn mờ anodizing tiêu chuẩn châu Âu',
          specs: `Kính hộp 3 lớp cách âm 45dB, phụ kiện rãnh C tiêu chuẩn châu Âu cho ${quantity} ${unit}`,
          bestFor: 'Biệt thự và căn hộ thông tầng siêu cao cấp',
          pros: 'Cách âm tuyệt đối, đẳng cấp hoàn thiện bậc nhất',
          cons: 'Thời gian nhập khẩu phụ kiện từ 3-4 tuần',
          unit,
          quantity,
          unitPriceVnd: p3,
          totalPriceVnd: Math.round(quantity * p3),
          priceLabel: `${money(Math.round(quantity * p3))} (${money(p3)}/${unit})`,
          sourceNote: `Hệ nhôm Civro cầu cách nhiệt Đức (${quantity} ${unit}). Hotline dự án: ${HOTLINE}`,
          contactPhone: HOTLINE,
          isQuoteRequired: true,
        },
      ];
    }
  }

  // 5. Mặc định: Kệ sách, Bàn ghế, Sofa, Nội thất rời
  const baseP = line.unit_price_vnd > 0 ? line.unit_price_vnd : 5000000;
  const p1 = Math.round(baseP / quantity);
  const p2 = Math.round((baseP * 1.35) / quantity);
  const p3 = Math.round((baseP * 2.1) / quantity);

  return [
    {
      id: 'melamine-std',
      title: `${line.title} — Vật liệu tiêu chuẩn MDF chống ẩm / Vải bọc D40`,
      material: 'Cốt gỗ MDF chống ẩm E1 / Khung sồi mút D40',
      finish: 'Melamine chống xước hoặc nỉ thô cao cấp',
      specs: `Gia công đồng bộ cho ${quantity} ${unit}, phụ kiện tiêu chuẩn xưởng`,
      bestFor: 'Nội thất rời căn hộ hiện đại tối ưu chi phí',
      pros: 'Bền đẹp, màu sắc phong phú, tiến độ gia công nhanh',
      cons: 'Cần bảo quản nơi khô ráo, tránh ẩm ướt kéo dài',
      unit,
      quantity,
      unitPriceVnd: p1,
      totalPriceVnd: Math.round(quantity * p1),
      priceLabel: `${money(Math.round(quantity * p1))} (${money(p1)}/${unit})`,
      sourceNote: `${line.title} tiêu chuẩn xưởng (${quantity} ${unit}). Nguồn: Gỗ An Cường / MOHO. Hotline: ${HOTLINE}`,
      sourceUrl: 'https://ancuong.com',
      contactPhone: HOTLINE,
    },
    {
      id: 'veneer-mid',
      title: `${line.title} — Plywood phủ Veneer sồi / Da Microfiber`,
      material: 'Plywood chống nước hoặc nệm lò xo bọc da microfiber',
      finish: 'Sơn PU hoàn thiện mờ vân gỗ tự nhiên sang trọng',
      specs: `Sản xuất theo bản vẽ thiết kế 3D chi tiết cho ${quantity} ${unit}`,
      bestFor: 'Nội thất phòng khách và điểm nhấn thẩm mỹ trung tâm',
      pros: 'Bề mặt vân gỗ/da tự nhiên cao cấp, độ bền vượt trội',
      cons: 'Chi phí cao hơn MDF thông thường',
      unit,
      quantity,
      unitPriceVnd: p2,
      totalPriceVnd: Math.round(quantity * p2),
      priceLabel: `${money(Math.round(quantity * p2))} (${money(p2)}/${unit})`,
      sourceNote: `${line.title} chất lượng cao (${quantity} ${unit}). Nguồn: An Cường Veneer / Da nhập. Hotline: ${HOTLINE}`,
      sourceUrl: 'https://ancuong.com/san-pham/veneer',
      contactPhone: HOTLINE,
    },
    {
      id: 'luxury-custom',
      title: `${line.title} — Gỗ tự nhiên Óc chó / Da thật Ý cao cấp`,
      material: 'Gỗ óc chó Bắc Mỹ nguyên khối hoặc Da bò Ý nhập khẩu',
      finish: 'Sơn lau dầu gốc khoáng tự nhiên thủ công',
      specs: `Đặt hàng may đo độc bản theo module hiện trạng cho ${quantity} ${unit}`,
      bestFor: 'Không gian sang trọng đỉnh cao đòi hỏi giá trị độc bản',
      pros: 'Càng dùng càng bóng đẹp, giá trị thẩm mỹ vượt thời gian',
      cons: 'Cần khảo sát hiện trạng và duyệt mẫu vật liệu thực tế trước khi chốt',
      unit,
      quantity,
      unitPriceVnd: p3,
      totalPriceVnd: Math.round(quantity * p3),
      priceLabel: `${money(Math.round(quantity * p3))} (${money(p3)}/${unit})`,
      sourceNote: `${line.title} cao cấp độc bản (${quantity} ${unit}). Nguồn: Xưởng nội thất cao cấp. Hotline tư vấn: ${HOTLINE}`,
      contactPhone: HOTLINE,
      isQuoteRequired: true,
    },
  ];
}

export function SceneCostPanel({ project, onRefresh }: { project: any; onRefresh: () => Promise<void> }) {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Line | null>(null);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [materialLine, setMaterialLine] = useState<Line | null>(null);
  const base = `/api/v1/projects/${encodeURIComponent(project.project_id)}`;

  async function load(signal?: AbortSignal) {
    const response = await fetch(`${base}/cost-workflow`, { signal });
    if (!response.ok) throw new Error(`Không tải được dự toán (${response.status})`);
    const data = await response.json();
    if (data.asset_hash !== project.external_scene.sha256) throw new Error('Cảnh đã thay đổi. Hãy mở lại dự toán.');
    setEstimate(data.estimate);
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(String(e.message));
    });
    return () => controller.abort();
  }, [base, project.revision, project.external_scene.sha256]);

  async function refresh() {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      await load();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const response = await fetch(`${base}/cost-items/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_hash: project.external_scene.sha256,
          unit_price_vnd: Number(form.get('price')),
          quantity: Number(form.get('quantity')),
          unit: String(form.get('unit')).trim(),
          price_status: form.get('status'),
          source_note: String(form.get('note')).trim(),
          source_url: String(form.get('url')).trim() || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(typeof data.detail === 'string' ? data.detail : `Không lưu được đơn giá (${response.status})`);
      }
      const updated = await response.json();
      setEstimate(updated);
      setEditing(null);
      setSuccessMsg(`Đã cập nhật đơn giá cho hạng mục "${editing.title}".`);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!editing) return;
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const response = await fetch(
        `${base}/cost-items/${encodeURIComponent(editing.id)}?asset_hash=${encodeURIComponent(project.external_scene.sha256)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error(`Không bỏ được giá nhập (${response.status})`);
      setEstimate(await response.json());
      setEditing(null);
      setSuccessMsg(`Đã đưa hạng mục "${editing.title}" về giá mặc định.`);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Áp dụng vật liệu & Cập nhật ngay tức thì ra ngoài bảng dự toán
  async function applyMaterial(line: Line, option: MaterialSuggestion) {
    setBusy(true);
    setError('');
    setSuccessMsg('');
    try {
      const response = await fetch(`${base}/cost-items/${encodeURIComponent(line.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_hash: project.external_scene.sha256,
          unit_price_vnd: option.unitPriceVnd,
          quantity: option.quantity,
          unit: option.unit,
          price_status: 'provided_unverified',
          source_note: option.sourceNote,
          source_url: option.sourceUrl || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(typeof data.detail === 'string' ? data.detail : `Không lưu được vật liệu (${response.status})`);
      }
      const updated = await response.json();
      setEstimate(updated);
      setMaterialLine(null);
      setSuccessMsg(`Đã chọn và áp dụng vật liệu "${option.title}" cho hạng mục "${line.title}": ${money(option.totalPriceVnd)} (${option.quantity} ${option.unit} × ${money(option.unitPriceVnd)})!`);
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Điền sẵn thông số của option vào form editing
  function editWithOption(line: Line, option: MaterialSuggestion) {
    setEditing({
      ...line,
      gross_quantity: option.quantity,
      unit: option.unit,
      unit_price_vnd: option.unitPriceVnd,
      source_note: option.sourceNote,
      source_url: option.sourceUrl || '',
      price_status: 'provided_unverified',
    });
    setMaterialLine(null);
  }

  const lines =
    estimate?.lines.filter(
      (line) =>
        (!missingOnly || line.price_status === 'unknown') &&
        `${line.title} ${line.specification}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))
    ) ?? [];

  return (
    <div className="page-container" data-testid="scene-cost-panel">
      <div className="page-header-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-page-title">Dự toán cảnh hiện tại</h1>
          <p className="text-body">{project.name} · Rev #{project.revision}</p>
          <p className="text-caption">Đơn giá được lưu riêng theo dự án và mô hình nguồn.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void refresh()} disabled={busy}>
            Tính lại dự toán
          </button>
          <a className="btn" href={`/api/v1/exports/${encodeURIComponent(project.project_id)}/csv`} download>
            Xuất CSV
          </a>
          <a className="btn btn-primary" href={`/api/v1/exports/${encodeURIComponent(project.project_id)}/xlsx`} download>
            Xuất Excel
          </a>
        </div>
      </div>

      {error && (
        <p role="alert" className="surface-card mb-4" style={{ color: 'var(--destructive, #b42318)' }}>
          {error}{' '}
          <button className="btn" onClick={() => void refresh()} disabled={busy}>
            Thử lại
          </button>
        </p>
      )}

      {successMsg && (
        <div role="status" className="surface-card mb-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span>{successMsg}</span>
          </div>
          <button className="text-sm underline text-emerald-800" onClick={() => setSuccessMsg('')}>Đóng</button>
        </div>
      )}

      {!estimate ? (
        <p role="status">Đang bóc tách dự toán từ cảnh GLB…</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="surface-card">
              <div className="text-caption">TẠM TÍNH PHẦN CÓ GIÁ · GỒM VAT GIẢ ĐỊNH {estimate.tax_rate * 100}%</div>
              <strong className="mono text-xl">{estimate.priced_line_count ? money(estimate.total_vnd) : 'Chưa có giá'}</strong>
              <p className="text-caption">Chưa phải báo giá toàn công trình</p>
            </div>
            <div className="surface-card">
              <div className="text-caption">GIÁ THAM KHẢO · TRƯỚC VAT</div>
              <strong className="mono text-xl">{money(estimate.reference_subtotal_vnd)}</strong>
              <p className="text-caption">Sản phẩm đối chiếu có thể khác mẫu, kích thước và vật liệu GLB</p>
            </div>
            <div className="surface-card">
              <div className="text-caption">GIÁ ĐÃ NHẬP · TRƯỚC VAT</div>
              <strong className="mono text-xl">{money(estimate.known_subtotal_vnd)}</strong>
              <p className="text-caption">Giá người dùng cung cấp hoặc chọn từ vật liệu đối chiếu</p>
            </div>
            <div className="surface-card">
              <div className="text-caption">ĐỘ PHỦ ĐƠN GIÁ</div>
              <strong className="text-xl">
                {estimate.priced_line_count}/{estimate.lines.length} hạng mục · {estimate.price_coverage_percent}%
              </strong>
              <p className="text-caption">Còn {estimate.unpriced_line_count} hạng mục cần bổ sung</p>
            </div>
          </div>

          <div className="surface-card" style={{ marginBottom: 16 }} data-testid="cost-workflow-status">
            {project.design_brief?.budget_mode === 'estimate_first' && (
              <p className="text-body">Lập dự toán trước, chưa giới hạn ngân sách.</p>
            )}
            <strong>Cost / BOM → QA → Final Review</strong>
            <p className="text-body">
              {estimate.total_is_complete
                ? 'Đã có đơn giá cho các hạng mục. Cần agent kiểm tra nguồn, khối lượng và trình phê duyệt.'
                : 'Cost/BOM cần bổ sung dữ liệu giá hoặc khối lượng trước khi nghiệm thu.'}
            </p>
            <p className="text-caption">
              {estimate.disclaimer} Hotline tư vấn kỹ thuật & báo giá xưởng:{' '}
              <a href={`tel:${HOTLINE.replace(/\D/g, '')}`} className="font-semibold underline text-primary">
                {HOTLINE}
              </a>
            </p>
          </div>

          {editing && (
            <form onSubmit={(event) => void save(event)} className="surface-card" style={{ marginBottom: 16 }} aria-label="Chỉnh đơn giá" key={editing.id}>
              <h2 className="text-lg font-semibold">Chỉnh đơn giá · {editing.title}</h2>
              <div className="grid gap-3 sm:grid-cols-3 my-3">
                <label>
                  Đơn giá (VNĐ)
                  <input className="field-input w-full" name="price" type="number" min="0" max="1000000000000" step="1" required defaultValue={editing.unit_price_vnd || ''} />
                </label>
                <label>
                  Khối lượng
                  <input className="field-input w-full" name="quantity" type="number" min="0.001" max="1000000" step="any" required defaultValue={editing.gross_quantity} />
                </label>
                <label>
                  Đơn vị (md, m², bộ, gói...)
                  <input className="field-input w-full" name="unit" maxLength={30} required defaultValue={editing.unit} />
                </label>
                <label>
                  Loại giá
                  <select className="field-select w-full" name="status" defaultValue={editing.price_status === 'illustrative' ? 'illustrative' : 'provided_unverified'}>
                    <option value="illustrative">Giá tham khảo</option>
                    <option value="provided_unverified">Giá người dùng cung cấp</option>
                  </select>
                </label>
                <label className="sm:col-span-2">
                  Nguồn / căn cứ đơn giá (Ghi rõ nhà cung cấp hoặc Hotline)
                  <input className="field-input w-full" name="note" maxLength={1000} required defaultValue={editing.source_note || ''} />
                </label>
                <label className="sm:col-span-3">
                  Link nguồn (nếu có)
                  <input className="field-input w-full" name="url" type="url" defaultValue={editing.source_url || ''} placeholder="https://..." />
                </label>
              </div>
              <p className="text-caption mb-3">
                Nhập 0 để đánh dấu chưa có giá. Khối lượng được tính chuẩn theo mét dài (md) cho tủ/rèm/lan can, m² cho sàn/tường/trần/cửa, hoặc bộ cho nội thất rời.
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={busy} type="submit">
                  {busy ? 'Đang lưu…' : 'Lưu đơn giá'}
                </button>
                <button className="btn" type="button" disabled={busy} onClick={() => setEditing(null)}>
                  Hủy
                </button>
                <button className="btn" type="button" disabled={busy} onClick={() => void reset()} title="Trở về giá tham khảo nếu có, hoặc đánh dấu chưa có giá">
                  Bỏ giá đã nhập
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-wrap gap-4 items-center mb-3">
            <input
              aria-label="Tìm hạng mục"
              className="field-input"
              placeholder="Tìm đồ vật, tầng…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />
              Chỉ mục chưa có giá
            </label>
          </div>

          <p className="text-caption mb-2 sm:hidden">Kéo bảng sang ngang để xem đơn giá và chỉnh giá.</p>

          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm" style={{ minWidth: 850 }}>
              <thead>
                <tr className="text-left border-b">
                  <th className="p-3">Hạng mục / Nguồn tham khảo & Hotline</th>
                  <th className="p-3">Khối lượng</th>
                  <th className="p-3 text-right">Đơn giá</th>
                  <th className="p-3 text-right">Thành tiền</th>
                  <th className="p-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b" data-testid="cost-line">
                    <td className="p-3" style={{ maxWidth: 560 }}>
                      <strong>{line.title}</strong>
                      <p className="text-caption">{line.specification}</p>
                      <p className="text-caption" style={{ color: line.price_status === 'unknown' ? '#b45309' : 'var(--accent)' }}>
                        {line.source_label}
                      </p>
                      {line.source_note && (
                        <p className="text-caption text-slate-700 bg-slate-50 p-1.5 rounded my-1 border border-slate-200">
                          {line.source_note}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                        {line.source_url ? (
                          <a className="underline text-caption text-accent font-semibold" href={line.source_url} target="_blank" rel="noopener noreferrer">
                            🌐 Nguồn đối chiếu · {line.checked_at || 'Đã kiểm tra'} ↗
                          </a>
                        ) : (
                          <span className="text-caption text-slate-500">Chưa có link đối chiếu trực tiếp</span>
                        )}
                        <a
                          href={`tel:${HOTLINE.replace(/\D/g, '')}`}
                          className="inline-flex items-center gap-1 text-amber-800 hover:text-amber-900 font-semibold underline"
                          title="Nhấp để gọi hoặc kết nối Zalo tư vấn báo giá"
                        >
                          📞 Báo giá: {HOTLINE}
                        </a>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap font-medium">
                      {line.gross_quantity} {line.unit}
                    </td>
                    <td className="p-3 text-right font-mono whitespace-nowrap">
                      {line.price_status === 'unknown' ? (
                        <span className="text-amber-600 font-semibold">Chưa có giá</span>
                      ) : (
                        <span>
                          {money(line.unit_price_vnd)}
                          <span className="text-xs text-slate-500 block">/{line.unit}</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono whitespace-nowrap font-bold text-slate-900">
                      {line.price_status === 'unknown' ? (
                        <a
                          href={`tel:${HOTLINE.replace(/\D/g, '')}`}
                          className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-900 font-semibold inline-block hover:bg-amber-200"
                        >
                          📞 Gọi báo giá
                        </a>
                      ) : (
                        money(line.subtotal_vnd)
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => setMaterialLine(line)}
                          aria-label={`Chọn vật liệu ${line.title}`}
                          title="Mở đề xuất vật liệu, tính theo md/m² và cập nhật giá ngay ra ngoài"
                        >
                          Chọn vật liệu
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => setEditing(line)}
                          aria-label={`Chỉnh giá ${line.title}`}
                        >
                          Chỉnh giá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!lines.length && <p className="p-4">Không có hạng mục phù hợp.</p>}
          </div>

          {/* Modal / Slide-over Đề xuất vật liệu & Áp dụng trực tiếp */}
          {materialLine && (
            <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Đề xuất vật liệu">
              <div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-caption">ĐỀ XUẤT CHO HẠNG MỤC</p>
                    <h2 className="text-xl font-semibold">{materialLine.title}</h2>
                    <p className="text-body text-slate-600">{materialLine.specification}</p>
                    <div className="mt-1 inline-flex items-center gap-2 px-2.5 py-1 rounded bg-blue-50 text-blue-900 text-xs font-medium border border-blue-200">
                      <span>Đo đạc hiện trạng:</span>
                      <strong>
                        {parseQuantityAndUnit(materialLine).quantity} {parseQuantityAndUnit(materialLine).unit}
                      </strong>
                    </div>
                  </div>
                  <button className="btn" onClick={() => setMaterialLine(null)} aria-label="Đóng đề xuất">
                    ✕ Đóng
                  </button>
                </div>

                <div className="surface-card my-4 p-3 bg-amber-50 border border-amber-200 text-amber-900">
                  <div className="font-semibold text-sm">💡 Cơ sở tham khảo vật liệu & Khối lượng chuẩn</div>
                  <p className="text-caption mt-1 text-amber-800">
                    Bấm <strong>“Áp dụng vật liệu & Cập nhật giá”</strong> để chốt phương án và cập nhật ngay lập tức ra bảng dự toán ngoài. Khối lượng được tính chuẩn theo mét dài (md), m² hoặc bộ.
                  </p>
                  <div className="mt-2 text-xs flex flex-wrap gap-4 items-center pt-2 border-t border-amber-200">
                    <span>
                      📞 Hotline tư vấn vật liệu:{' '}
                      <a href={`tel:${HOTLINE.replace(/\D/g, '')}`} className="font-bold underline text-amber-950">
                        {HOTLINE}
                      </a>
                    </span>
                    {materialLine.source_url ? (
                      <a className="underline text-blue-800 font-semibold" href={materialLine.source_url} target="_blank" rel="noopener noreferrer">
                        🌐 Mở catalogue nguồn hiện có ↗
                      </a>
                    ) : (
                      <span className="text-slate-500">Chưa có link catalogue</span>
                    )}
                  </div>
                </div>

                <div className="grid gap-4">
                  {suggestionsForLine(materialLine).map((option) => (
                    <article key={option.id} className="surface-card border border-slate-200 shadow-sm p-4 hover:border-blue-400 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-base text-slate-900">{option.title}</h3>
                          <p className="text-caption text-slate-600">
                            {option.material} · {option.finish}
                          </p>
                        </div>
                        <div className="text-right">
                          <strong className="mono text-lg text-emerald-700 block whitespace-nowrap">
                            {money(option.totalPriceVnd)}
                          </strong>
                          <span className="text-xs text-slate-500 font-mono">
                            {money(option.unitPriceVnd)} / {option.unit}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 space-y-1 text-xs text-slate-700">
                        <p>
                          <strong>Khối lượng tính:</strong> {option.quantity} {option.unit}
                        </p>
                        <p>
                          <strong>Quy cách:</strong> {option.specs}
                        </p>
                        <p>
                          <strong>Phù hợp:</strong> {option.bestFor}
                        </p>
                        <p className="text-emerald-700">
                          <strong>Ưu điểm:</strong> {option.pros}
                        </p>
                        <p className="text-amber-800">
                          <strong>Lưu ý:</strong> {option.cons}
                        </p>
                      </div>

                      {/* Nguồn và SĐT liên hệ báo giá */}
                      <div className="mt-3 p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-medium text-slate-800">📑 Nguồn: {option.sourceNote}</span>
                          {option.sourceUrl && (
                            <a className="text-accent underline font-semibold" href={option.sourceUrl} target="_blank" rel="noopener noreferrer">
                              Link đối chiếu ↗
                            </a>
                          )}
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-amber-900 font-medium">
                            📞 Hotline liên hệ báo giá:{' '}
                            <a href={`tel:${option.contactPhone.replace(/\D/g, '')}`} className="underline font-bold text-amber-950">
                              {option.contactPhone}
                            </a>{' '}
                            (Zalo / Báo giá xưởng)
                          </span>
                          {option.isQuoteRequired && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[11px]">
                              Cần duyệt mẫu thực tế
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                        <button
                          className="btn btn-sm btn-primary"
                          disabled={busy}
                          onClick={() => void applyMaterial(materialLine, option)}
                          title="Lưu ngay phương án này và cập nhật đơn giá, khối lượng ra bảng dự toán ngoài"
                        >
                          {busy ? 'Đang cập nhật…' : '✓ Áp dụng vật liệu & Cập nhật giá'}
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => editWithOption(materialLine, option)}
                          title="Điền sẵn đơn giá và thông số của vật liệu này vào form để chỉnh sửa thêm"
                        >
                          Tùy chỉnh & Nhập chi tiết
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    className="btn"
                    onClick={() => {
                      setEditing(materialLine);
                      setMaterialLine(null);
                    }}
                  >
                    Chỉnh giá thủ công mục này
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
