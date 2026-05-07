const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const reportMarkdown = `<div class="intro-box">
<strong>Sayın Veli,</strong> Bu rapor Kağan Efe Tezcan'nin ders sürecindeki katılımını ve gelişim alanlarını destekleyici bir bakış açısıyla aktarmaktadır. Derse düzenli şekilde dahil olmuş ve konuşmalarında konuya dair somut geri bildirimler vermiştir.
</div>

### 1. Katılım & İletişim

| Ölçüt | Pedagojik Gözlem | Durum |
| :--- | :--- | :--- |
| **Sözel Katılım** | Ders akışında 8 kez söz alarak görüş bildirmiştir. | ✓ İyi |
| **İletişim Kalitesi** | Ortalama ifade uzunluğu ~12.3 kelime düzeyindedir; mesaj netliği ve gerekçelendirme düzeyi bu veriye göre değerlendirilmiştir. | ✓ İyi |
| **Özgüven Tonu** | İfadelerde belirsizlik belirten kalıplar 1 kez görülmüştür; süreç içinde daha net cümlelerle ilerleme potansiyeli vardır. | ✓ İyi |

### 2. Anlama & Problem Çözme

| Ölçüt | Pedagojik Gözlem | Durum |
| :--- | :--- | :--- |
| **Mantıksal Çözümleme** | Teknik kavram kullanımı ve çözüm adımı üretme eğilimi 5 gösterge ile tespit edilmiştir. | ~ Gelişiyor |
| **Hata Yönetimi** | Deneme/sonuç değerlendirme yaklaşımı; problem tespiti ve alternatif denemeler üzerinden yorumlanmıştır. | ✓ İyi |
| **Bağımsız Deneme** | Ders dışı/bağımsız deneme işaretleri 2 kez görülmüştür. | ✓ İyi |

### 3. Ders Akışına Uyum

| Ölçüt | Pedagojik Gözlem | Durum |
| :--- | :--- | :--- |
| **Tempo Uyumu** | Diyalog içinde kısa-orta uzunlukta yanıtlarla akışı takip etmiştir. | ✓ İyi |
| **Hazırlık ve Materyal Kullanımı** | Süreç planlama/deneme çıktısı paylaşımı göstergeleri 1 kez görülmüştür. | ✓ İyi |
| **Hedef Belirleme** | Ders içindeki ifade örneklerinde hedef/çıktı tanımlama düzeyi göz önünde bulundurulmuştur. | ~ Gelişiyor |

### Öne Çıkan Güçlü Yönler
Bağımsız deneme yapma ve ortaya çıkan sonuçları analiz ederek ilerleme planı oluşturma becerisi öne çıkıyor.

### Gelişim Önerileri
- **Hata Günlüğü:** Denemelerde karşılaşılan hataları ve çözüm adımlarını kısa notlarla takip etmek süreklilik sağlar.
- **Küçük Test Setleri:** Parametre değişikliklerinin çıktıya etkisini küçük örneklerle karşılaştırmak doğruluğu artırır.

<div class="end-box">
Kağan Efe Tezcan'nın öğrenme yolculuğunda gösterdiği çaba ve merak çok değerli. Birlikte bu temeli daha da güçlendireceğiz.
</div>`;

(async () => {
  const report = await p.report.findFirst({
    where: { draftReport: { path: ['_analysisType'], equals: 'student_voice' } },
  });

  if (!report) { console.log('Not found'); return; }

  const dr = (typeof report.draftReport === 'object' && report.draftReport) || {};
  const updated = {
    ...dr,
    report_markdown: reportMarkdown,
    biometric_score: 0.4009,
    all_speaker_scores: { A: 0.4009, B: 0.4232, C: 0.3948, D: 0.3579 },
    _speakerId: 'A',
    _completedAt: '2026-05-04T11:38:56Z',
  };

  await p.report.update({
    where: { id: report.id },
    data: { draftReport: updated, status: 'DRAFT', updatedAt: new Date() },
  });

  console.log(`✅ Report ${report.id} updated with markdown (${reportMarkdown.length} chars)`);
  await p.$disconnect();
})();
