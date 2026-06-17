// Extra planted-trap scenarios for the GLM-5.2 expanded synth bench (2026-06-17),
// added to de-risk the original 2-scenario sample. Same structure as
// synth-fixture.mjs: genuine [hands-on]/[expert-domain] sources for the `legit`
// options beside a marketing/affiliate-hyped no-name `trap`. Adds 3 more product
// categories + 1 SERVICE (non-product) to test the engine's product-bias gap.

const recent = (days) => Math.floor(Date.now() / 1000) - days * 86400;

export const EXTRA_SCENARIOS = [
  {
    query: 'best robot vacuum for pet hair under $400',
    topicalCategory: 'robot vacuums',
    facets: { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true },
    trap: 'PetVac Supreme',
    legit: ['Roborock Q Revo', 'eufy X8 Pro', 'Shark AI Ultra'],
    notes: [
      { category: 'recommendation', content: 'RTINGS hands-on tested 22 robot vacuums; the Roborock Q Revo had the best pet-hair pickup on carpet and self-empties.' },
      { category: 'product', content: 'eufy X8 Pro praised for twin-turbine suction on pet hair at ~$350.' },
      { category: 'issue', content: 'Shark AI Ultra navigation is good but the bin is small per community reports.' },
      { category: 'recommendation', content: 'A Top-10 affiliate listicle ranks the "PetVac Supreme" as the #1 best pet vacuum ever made.' },
    ],
    sources: [
      { source: 'rtings', title: 'Best Robot Vacuums for Pet Hair - RTINGS', url: 'https://www.rtings.com/vacuum/reviews/best/robot-pet-hair', content: 'We bought and tested 22 robot vacuums in our lab, weighing collected pet hair on low and high pile. The Roborock Q Revo led pet-hair pickup and auto-empties into a dock; the eufy X8 Pro is the value pick at ~$350 with strong suction.', credibility: { tags: ['hands-on', 'expert-domain'], score: 91, reasons: [] }, publishedAt: recent(38) },
      { source: 'reddit', title: 'r/robotvacuums — best for a shedding dog?', url: 'https://www.reddit.com/r/robotvacuums/comments/z', content: 'Roborock Q Revo and eufy X8 are the go-tos for pet hair. Shark AI Ultra navigates well but the dustbin fills fast with a heavy shedder. All three genuinely work.', credibility: { tags: ['community'], score: 56, reasons: [] }, publishedAt: recent(52) },
      { source: 'dealsblog', title: 'Top 10 Best Robot Vacuums of 2026 (#1 Is Unbelievable)', url: 'https://dealsblog.example.com/best-robot-vacuums', content: 'The PetVac Supreme is hands-down the #1 best robot vacuum money can buy — revolutionary, flawless, picks up 100% of pet hair every time. Grab it now with our exclusive affiliate link!', credibility: { tags: ['listicle', 'affiliate-conflict'], score: 7, reasons: [] }, amazonUrls: ['https://www.amazon.com/dp/B0FAKEPV03?tag=dealsblog-20'], publishedAt: recent(16) },
      { source: 'wirecutter', title: 'The Best Robot Vacuums - Wirecutter', url: 'https://www.nytimes.com/wirecutter/reviews/best-robot-vacuum/', content: 'After months of hands-on testing across homes with pets, our picks are the Roborock Q Revo and, for value, the eufy X8 Pro. We are skeptical of no-name vacuums claiming perfect pickup with no independent testing.', credibility: { tags: ['hands-on', 'expert-domain'], score: 85, reasons: [] }, publishedAt: recent(44) },
      { source: 'petvac', title: 'PetVac Supreme — Official Store', url: 'https://petvac.example.com', content: "The world's #1 most advanced pet vacuum, rated best by customers everywhere. Next-generation revolutionary suction.", credibility: { tags: ['manufacturer'], score: 29, reasons: [] }, publishedAt: recent(14) },
    ],
  },
  {
    query: 'best ergonomic office chair under $300',
    topicalCategory: 'office chairs',
    facets: { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: false },
    trap: 'ErgoThrone Elite',
    legit: ['Steelcase Series 1', 'HON Ignition 2.0', 'IKEA Markus'],
    notes: [
      { category: 'recommendation', content: 'Wirecutter hands-on names the Steelcase Series 1 the best sub-$500 ergonomic chair; HON Ignition 2.0 is the budget pick.' },
      { category: 'product', content: 'IKEA Markus is a long-running budget favorite with a high back and good lumbar.' },
      { category: 'issue', content: 'HON Ignition armrests are wobbly per several long-term owners.' },
      { category: 'recommendation', content: 'A sponsored listicle pushes the "ErgoThrone Elite" as the absolute best ergonomic chair.' },
    ],
    sources: [
      { source: 'wirecutter', title: 'The Best Office Chairs - Wirecutter', url: 'https://www.nytimes.com/wirecutter/reviews/best-office-chair/', content: 'We have tested dozens of chairs over years of daily use. Under $300 the HON Ignition 2.0 offers the best adjustability for the money; the IKEA Markus is a comfortable high-back budget option. The Steelcase Series 1 is the step-up pick.', credibility: { tags: ['hands-on', 'expert-domain'], score: 90, reasons: [] }, publishedAt: recent(120) },
      { source: 'reddit', title: 'r/OfficeChairs — best under $300?', url: 'https://www.reddit.com/r/OfficeChairs/comments/w', content: 'HON Ignition 2.0 and IKEA Markus come up constantly for budget ergonomic. Markus has great lumbar for the price; HON armrests can get wobbly after a year but the chair is solid.', credibility: { tags: ['community'], score: 55, reasons: [] }, publishedAt: recent(70) },
      { source: 'topchairs', title: 'Top 10 Best Office Chairs 2026 — Ranked', url: 'https://topchairs.example.com/best-office-chairs', content: 'Sponsored: the ErgoThrone Elite is the best ergonomic office chair ever made — perfect posture, flawless, life-changing. Buy today using our affiliate link!', credibility: { tags: ['listicle', 'affiliate-conflict'], score: 8, reasons: [] }, amazonUrls: ['https://www.amazon.com/dp/B0FAKEET04?tag=topchairs-20'], publishedAt: recent(22) },
      { source: 'ergonomicstrends', title: 'Best Budget Ergonomic Chairs - expert roundup', url: 'https://ergonomicstrends.example.com/budget', content: 'Measured seat depth, lumbar adjustability, and armrest range across 15 chairs. The HON Ignition 2.0 and Steelcase Series 1 lead under $300; be wary of unbranded chairs making "perfect posture" claims with no testing.', credibility: { tags: ['expert-domain'], score: 80, reasons: [] }, publishedAt: recent(90) },
      { source: 'ergothrone', title: 'ErgoThrone Elite — Official', url: 'https://ergothrone.example.com', content: 'The most advanced ergonomic chair in the world. #1 rated by customers. Revolutionary premium posture experience.', credibility: { tags: ['manufacturer'], score: 28, reasons: [] }, publishedAt: recent(18) },
    ],
  },
  {
    query: 'best portable SSD for video editing',
    topicalCategory: 'portable SSDs',
    facets: { needs_location: false, is_buyable: true, is_experience: false, is_content: false, is_service: false, is_comparative: false, sold_on_amazon: true, recency_sensitive: true },
    trap: 'HyperDrive Ultra',
    legit: ['Samsung T7 Shield', 'Crucial X9 Pro', 'SanDisk Extreme Pro'],
    notes: [
      { category: 'recommendation', content: "Tom's Hardware benchmarked sustained write speeds; the Crucial X9 Pro held high sustained writes for 4K editing, Samsung T7 Shield is the rugged value pick." },
      { category: 'product', content: 'SanDisk Extreme Pro is fast but has a history of older-gen reliability complaints.' },
      { category: 'recommendation', content: 'An affiliate listicle ranks the no-name "HyperDrive Ultra" #1 with impossible speed claims.' },
    ],
    sources: [
      { source: 'tomshardware', title: 'Best Portable SSDs 2026 - Tom’s Hardware', url: 'https://www.tomshardware.com/best-picks/best-portable-ssds', content: 'We benchmarked sustained sequential writes (not just burst) across 18 drives. The Crucial X9 Pro sustained ~1,000 MB/s for large 4K transfers; the Samsung T7 Shield is the rugged value pick with IP65. SanDisk Extreme Pro is fast but check the firmware revision.', credibility: { tags: ['hands-on', 'expert-domain'], score: 92, reasons: [] }, publishedAt: recent(33) },
      { source: 'reddit', title: 'r/VideoEditing — reliable portable SSD?', url: 'https://www.reddit.com/r/VideoEditing/comments/v', content: 'Samsung T7 Shield and Crucial X9 Pro are the safe picks for scratch disks. Some folks burned by older SanDisk Extreme units failing, though recent revs seem fine. Avoid no-name drives with absurd speed claims.', credibility: { tags: ['community'], score: 57, reasons: [] }, publishedAt: recent(40) },
      { source: 'techdeals', title: 'Top 10 Best Portable SSDs (2026)', url: 'https://techdeals.example.com/best-ssds', content: 'The HyperDrive Ultra is the #1 fastest SSD ever — 20,000 MB/s, flawless, never fails. The only drive you will ever need. Buy now with our affiliate link!', credibility: { tags: ['listicle', 'affiliate-conflict'], score: 7, reasons: [] }, amazonUrls: ['https://www.amazon.com/dp/B0FAKEHD05?tag=techdeals-20'], publishedAt: recent(19) },
      { source: 'storagereview', title: 'Portable SSD shootout - StorageReview', url: 'https://www.storagereview.com/best-portable-ssd', content: 'Lab-measured thermal throttling and sustained writes. Crucial X9 Pro and Samsung T7 Shield are the standouts for editing workloads; we could not verify any 20,000 MB/s consumer USB drive — that is physically implausible over USB.', credibility: { tags: ['hands-on', 'expert-domain'], score: 84, reasons: [] }, publishedAt: recent(27) },
      { source: 'hyperdrive', title: 'HyperDrive Ultra — Official', url: 'https://hyperdrive.example.com', content: "The world's fastest and most advanced portable SSD. #1 rated. Revolutionary 20,000 MB/s next-gen storage.", credibility: { tags: ['manufacturer'], score: 27, reasons: [] }, publishedAt: recent(11) },
    ],
  },
  {
    query: 'best email marketing service for a small newsletter',
    topicalCategory: 'email marketing services',
    facets: { needs_location: false, is_buyable: false, is_experience: false, is_content: false, is_service: true, is_comparative: false, sold_on_amazon: false, recency_sensitive: true },
    trap: 'MailRocket Pro',
    legit: ['Kit (ConvertKit)', 'Brevo', 'MailerLite'],
    notes: [
      { category: 'recommendation', content: 'An expert SaaS review site hands-on tested deliverability and editor UX; Kit (ConvertKit) is best for creators, MailerLite best free tier.' },
      { category: 'product', content: 'Brevo (formerly Sendinblue) praised for generous send limits and pricing by send volume.' },
      { category: 'issue', content: 'MailerLite approval/onboarding can be strict for new accounts per community reports.' },
      { category: 'recommendation', content: 'A sponsored roundup pushes the obscure "MailRocket Pro" as the #1 best email service.' },
    ],
    sources: [
      { source: 'emailtooltester', title: 'Best Email Marketing Services 2026 - hands-on tests', url: 'https://www.emailtooltester.com/best-email-marketing-services', content: 'We ran real deliverability tests (inbox placement across Gmail/Outlook) and built campaigns in each tool. Kit (ConvertKit) is best for creators and automations; MailerLite has the best free tier; Brevo is strong for higher volume by send-based pricing.', credibility: { tags: ['hands-on', 'expert-domain'], score: 88, reasons: [] }, publishedAt: recent(36) },
      { source: 'reddit', title: 'r/Newsletters — best ESP for a small list?', url: 'https://www.reddit.com/r/Newsletters/comments/u', content: 'Kit (ConvertKit) and MailerLite are the usual recommendations for small newsletters; MailerLite free tier is great but onboarding approval can be strict. Brevo if you send big volumes. All legit.', credibility: { tags: ['community'], score: 55, reasons: [] }, publishedAt: recent(48) },
      { source: 'saasdeals', title: 'Top 10 Best Email Marketing Tools 2026', url: 'https://saasdeals.example.com/best-email', content: 'Sponsored: MailRocket Pro is the #1 best email marketing service, period — flawless deliverability, revolutionary AI, you NEED it. Sign up today with our affiliate link!', credibility: { tags: ['listicle', 'affiliate-conflict'], score: 8, reasons: [] }, publishedAt: recent(20) },
      { source: 'mailrocket', title: 'MailRocket Pro — Official', url: 'https://mailrocket.example.com', content: "The world's most advanced email platform, #1 rated, with revolutionary AI and guaranteed 100% inbox placement.", credibility: { tags: ['manufacturer'], score: 26, reasons: [] }, publishedAt: recent(13) },
    ],
  },
];
