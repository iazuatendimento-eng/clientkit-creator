/**
 * Simple PT→EN dictionary-based translation for stock media search.
 * No AI cost — just maps common Portuguese words to English equivalents.
 * Also includes cognates (words identical/similar in both languages).
 */

const PT_EN: Record<string, string> = {
  // ── Health & Medical ──
  saúde: "health", saude: "health", médico: "doctor", medico: "doctor",
  hospital: "hospital", clínica: "clinic", clinica: "clinic",
  dentista: "dentist", odontologia: "dentistry", odontológico: "dental", odontologico: "dental",
  sorriso: "smile", dente: "tooth", dentes: "teeth",
  bem: "well", estar: "being", "bem-estar": "wellness",
  cuidado: "care", cuidados: "care", atenção: "attention", atencao: "attention",
  vida: "life", viver: "living", qualidade: "quality",
  família: "family", familia: "family", crianças: "children", criancas: "children",
  mulher: "woman", homem: "man", pessoas: "people", pessoa: "person",
  idoso: "elderly", bebê: "baby", bebe: "baby", jovem: "young",
  psicologia: "psychology", psicólogo: "psychologist", psicologo: "psychologist",
  terapia: "therapy", terapeuta: "therapist", mental: "mental",
  emocional: "emotional", ansiedade: "anxiety", depressão: "depression", depressao: "depression",
  fisioterapia: "physiotherapy", fisioterapeuta: "physiotherapist",
  nutrição: "nutrition", nutricao: "nutrition", nutricionista: "nutritionist",
  farmácia: "pharmacy", farmacia: "pharmacy", remédio: "medicine", remedio: "medicine",
  cirurgia: "surgery", exame: "exam", diagnóstico: "diagnosis", diagnostico: "diagnosis",
  tratamento: "treatment", prevenção: "prevention", prevencao: "prevention",
  oftalmologia: "ophthalmology", dermatologia: "dermatology", cardiologia: "cardiology",
  pediatria: "pediatrics", ortopedia: "orthopedics", neurologia: "neurology",
  oncologia: "oncology", urologia: "urology", ginecologia: "gynecology",
  enfermagem: "nursing", enfermeiro: "nurse", ambulância: "ambulance", ambulancia: "ambulance",
  vacina: "vaccine", vacinação: "vaccination", vacinacao: "vaccination",
  ótica: "optical", otica: "optical", óculos: "glasses", oculos: "glasses",
  audiologia: "audiology", fonoaudiologia: "speech therapy",
  prótese: "prosthesis", protese: "prosthesis", implante: "implant",

  // ── Business & Corporate ──
  empresa: "business", negócio: "business", negocio: "business",
  trabalho: "work", escritório: "office", escritorio: "office",
  equipe: "team", liderança: "leadership", lideranca: "leadership",
  sucesso: "success", crescimento: "growth", resultado: "results",
  marketing: "marketing", vendas: "sales", cliente: "client", clientes: "clients",
  digital: "digital", tecnologia: "technology", inovação: "innovation", inovacao: "innovation",
  financeiro: "financial", investimento: "investment", dinheiro: "money",
  empreendedor: "entrepreneur", empreendedorismo: "entrepreneurship",
  gestão: "management", gestao: "management", gerência: "management", gerencia: "management",
  administração: "administration", administracao: "administration",
  franquia: "franchise", franquias: "franchise", franchising: "franchise",
  estratégia: "strategy", estrategia: "strategy", planejamento: "planning",
  reunião: "meeting", reuniao: "meeting", apresentação: "presentation", apresentacao: "presentation",
  corporativo: "corporate", executivo: "executive", empreendimento: "enterprise",
  lucro: "profit", receita: "revenue", faturamento: "revenue",
  contrato: "contract", parceria: "partnership", sócio: "partner", socio: "partner",
  networking: "networking", startup: "startup", marca: "brand",
  treinamento: "training", capacitação: "training", capacitacao: "training",
  mentoria: "mentoring", coaching: "coaching", palestra: "lecture",
  congresso: "congress", conferência: "conference", conferencia: "conference",
  comércio: "commerce", comercio: "commerce", varejo: "retail", atacado: "wholesale",
  indústria: "industry", industria: "industry", industrial: "industrial",
  fabricação: "manufacturing", fabricacao: "manufacturing", fábrica: "factory", fabrica: "factory",

  // ── Food & Beverage ──
  comida: "food", alimento: "food", alimentação: "nutrition", alimentacao: "nutrition",
  restaurante: "restaurant", café: "coffee", cafe: "coffee",
  cozinha: "kitchen", receita: "recipe", saudável: "healthy", saudavel: "healthy",
  fruta: "fruit", legume: "vegetable", carne: "meat", peixe: "fish",
  pizza: "pizza", hambúrguer: "hamburger", hamburguer: "hamburger", lanche: "snack",
  padaria: "bakery", confeitaria: "pastry", doce: "sweet", bolo: "cake",
  sorvete: "ice cream", açaí: "acai", acai: "acai",
  cerveja: "beer", vinho: "wine", bebida: "drink", suco: "juice",
  churrasco: "barbecue", churrasqueira: "grill", grelhado: "grilled",
  japonês: "japanese", japones: "japanese", sushi: "sushi", oriental: "asian",
  italiano: "italian", mexicano: "mexican", árabe: "arabic", arabe: "arabic",
  bar: "bar", pub: "pub", balada: "nightclub", boate: "nightclub",
  gourmet: "gourmet", gastronomia: "gastronomy", chef: "chef",
  buffet: "buffet", catering: "catering", delivery: "delivery",
  orgânico: "organic", organico: "organic", natural: "natural", vegano: "vegan",
  vegetariano: "vegetarian", integral: "whole grain", diet: "diet", fitness: "fitness",

  // ── Education ──
  educação: "education", educacao: "education", escola: "school",
  universidade: "university", professor: "teacher", aluno: "student",
  aprendizado: "learning", conhecimento: "knowledge", livro: "book",
  estudo: "study", curso: "course", aula: "class",
  faculdade: "college", ensino: "teaching", formação: "training", formacao: "training",
  vestibular: "entrance exam", concurso: "exam", prova: "test",
  pós: "post", graduação: "graduation", graduacao: "graduation",
  mestrado: "masters", doutorado: "doctorate", pesquisa: "research",
  bolsa: "scholarship", matrícula: "enrollment", matricula: "enrollment",
  infantil: "children", fundamental: "elementary", médio: "high school",

  // ── Real Estate & Construction ──
  casa: "house", apartamento: "apartment", imóvel: "property", imovel: "property",
  construção: "construction", construcao: "construction",
  arquitetura: "architecture", decoração: "decoration", decoracao: "decoration",
  jardim: "garden", interior: "interior", moderno: "modern",
  imobiliária: "real estate", imobiliaria: "real estate",
  engenharia: "engineering", engenheiro: "engineer",
  obra: "construction site", pedreiro: "bricklayer", pintura: "painting",
  piscina: "pool", condomínio: "condominium", condominio: "condominium",
  terreno: "land", lote: "lot", prédio: "building", predio: "building",
  aluguel: "rent", venda: "sale", compra: "purchase",
  móvel: "furniture", movel: "furniture", móveis: "furniture", moveis: "furniture",
  marcenaria: "carpentry", serralheria: "metalwork", vidraçaria: "glazing",
  elétrica: "electrical", eletrica: "electrical", hidráulica: "plumbing", hidraulica: "plumbing",

  // ── Nature & Environment ──
  natureza: "nature", meio: "environment", ambiente: "environment",
  sustentável: "sustainable", sustentavel: "sustainable",
  água: "water", agua: "water", floresta: "forest", praia: "beach",
  sol: "sun", céu: "sky", ceu: "sky", montanha: "mountain",
  animal: "animal", planta: "plant", verde: "green",
  reciclagem: "recycling", ecológico: "ecological", ecologico: "ecological",
  campo: "field", rural: "rural", agrícola: "agricultural", agricola: "agricultural",
  agronegócio: "agribusiness", agronegocio: "agribusiness", fazenda: "farm",
  pecuária: "livestock", pecuaria: "livestock", gado: "cattle",

  // ── Fitness & Sports ──
  esporte: "sport", exercício: "exercise", exercicio: "exercise",
  treino: "training", academia: "gym", corrida: "running",
  musculação: "bodybuilding", musculacao: "bodybuilding",
  yoga: "yoga", pilates: "pilates", corpo: "body",
  atleta: "athlete", competição: "competition", competicao: "competition",
  futebol: "soccer", basquete: "basketball", vôlei: "volleyball", volei: "volleyball",
  natação: "swimming", natacao: "swimming", ciclismo: "cycling",
  maratona: "marathon", crossfit: "crossfit", funcional: "functional",
  luta: "fighting", boxe: "boxing", artes: "arts", marciais: "martial",
  dança: "dance", danca: "dance", ballet: "ballet", zumba: "zumba",

  // ── Beauty & Fashion ──
  beleza: "beauty", moda: "fashion", cabelo: "hair",
  maquiagem: "makeup", pele: "skin", rosto: "face",
  roupa: "clothing", estilo: "style", elegante: "elegant",
  salão: "salon", salao: "salon", barbearia: "barbershop",
  manicure: "manicure", pedicure: "pedicure", unhas: "nails",
  estética: "aesthetics", estetica: "aesthetics", spa: "spa",
  massagem: "massage", depilação: "waxing", depilacao: "waxing",
  cosmético: "cosmetics", cosmetico: "cosmetics", perfume: "perfume",
  joias: "jewelry", jóias: "jewelry", acessórios: "accessories", acessorios: "accessories",
  bijuteria: "jewelry", relogio: "watch", relógio: "watch",
  noiva: "bride", vestido: "dress", terno: "suit",

  // ── Law & Professional Services ──
  advogado: "lawyer", direito: "law", justiça: "justice", justica: "justice",
  contabilidade: "accounting", contador: "accountant",
  seguro: "insurance", consultoria: "consulting",
  jurídico: "legal", juridico: "legal", tribunal: "court",
  processo: "process", causa: "case", defesa: "defense",
  trabalhista: "labor", tributário: "tax", tributario: "tax",
  penal: "criminal", civil: "civil", empresarial: "corporate",
  auditoria: "auditing", perícia: "expertise", pericia: "expertise",
  cartório: "notary", cartorio: "notary", documento: "document",

  // ── Auto & Transport ──
  carro: "car", veículo: "vehicle", veiculo: "vehicle",
  transporte: "transport", viagem: "travel", turismo: "tourism",
  moto: "motorcycle", motocicleta: "motorcycle", bicicleta: "bicycle",
  ônibus: "bus", onibus: "bus", metrô: "subway", metro: "subway",
  avião: "airplane", aviao: "airplane", aeroporto: "airport",
  trem: "train", navio: "ship", barco: "boat",
  oficina: "workshop", mecânico: "mechanic", mecanico: "mechanic",
  pneu: "tire", óleo: "oil", oleo: "oil", lavagem: "car wash",
  estacionamento: "parking", garagem: "garage", guincho: "tow truck",
  autoescola: "driving school", habilitação: "license", habilitacao: "license",
  táxi: "taxi", taxi: "taxi", uber: "rideshare",
  frete: "freight", caminhão: "truck", caminhao: "truck",
  logística: "logistics", logistica: "logistics", entrega: "delivery", envio: "shipping",
  pontualidade: "punctuality", garantida: "guaranteed", garantia: "warranty",
  sempre: "always", rápido: "fast", rapido: "fast",
  mudança: "moving", mudanca: "moving", carga: "cargo", frota: "fleet",
  rodoviário: "road", rodoviario: "road", estrada: "road", motorista: "driver",

  // ── Technology & Digital ──
  computador: "computer", software: "software", aplicativo: "app",
  internet: "internet", rede: "network", dados: "data",
  inteligência: "intelligence", inteligencia: "intelligence", artificial: "artificial",
  programação: "programming", programacao: "programming", desenvolvedor: "developer",
  sistema: "system", sistemas: "systems", site: "website",
  celular: "smartphone", tablet: "tablet", eletrônico: "electronic", eletronico: "electronic",
  robô: "robot", robo: "robot", automação: "automation", automacao: "automation",
  nuvem: "cloud", servidor: "server", segurança: "security", seguranca: "security",
  cyber: "cyber", hacker: "hacker", criptografia: "encryption",
  ecommerce: "ecommerce", loja: "store", online: "online",

  // ── Cleaning & Maintenance ──
  limpeza: "cleaning", faxina: "cleaning", faxineira: "cleaner",
  higiene: "hygiene", higienização: "sanitization", higienizacao: "sanitization",
  dedetização: "pest control", dedetizacao: "pest control",
  jardinagem: "gardening", paisagismo: "landscaping",
  manutenção: "maintenance", manutencao: "maintenance",
  impermeabilização: "waterproofing", impermeabilizacao: "waterproofing",
  desentupimento: "unclogging", encanamento: "plumbing",
  lavanderia: "laundry", passadoria: "ironing",

  // ── Pet ──
  pet: "pet", cachorro: "dog", gato: "cat",
  veterinário: "veterinary", veterinario: "veterinary",
  petshop: "pet shop", banho: "bath", tosa: "grooming",
  ração: "pet food", racao: "pet food", adestramento: "training",
  adoção: "adoption", adocao: "adoption",

  // ── Religion & Spirituality ──
  igreja: "church", fé: "faith", fe: "faith",
  deus: "god", oração: "prayer", oracao: "prayer",
  pastor: "pastor", padre: "priest", culto: "worship",
  bíblia: "bible", biblia: "bible", evangelho: "gospel",
  espiritual: "spiritual", meditação: "meditation", meditacao: "meditation",

  // ── Agriculture & Rural ──
  agricultura: "agriculture", plantio: "planting", colheita: "harvest",
  soja: "soybean", milho: "corn", trigo: "wheat", arroz: "rice",
  café: "coffee", cacau: "cocoa", algodão: "cotton", algodao: "cotton",
  irrigação: "irrigation", irrigacao: "irrigation", adubo: "fertilizer",
  trator: "tractor", máquina: "machine", maquina: "machine",
  silo: "silo", armazém: "warehouse", armazem: "warehouse",
  agrônomo: "agronomist", agronomo: "agronomist",

  // ── Entertainment & Culture ──
  cinema: "cinema", filme: "movie", teatro: "theater",
  show: "show", concerto: "concert", festival: "festival",
  música: "music", musica: "music", arte: "art", design: "design",
  foto: "photo", fotografia: "photography", vídeo: "video", video: "video",
  evento: "event", festa: "party", casamento: "wedding",
  aniversário: "birthday", aniversario: "birthday",
  cultura: "culture", exposição: "exhibition", exposicao: "exhibition",
  museu: "museum", galeria: "gallery", artista: "artist",
  ator: "actor", atriz: "actress", cantor: "singer",
  banda: "band", dj: "dj", karaoke: "karaoke",
  recreação: "recreation", recreacao: "recreation", lazer: "leisure",
  parque: "park", diversão: "fun", diversao: "fun",
  brinquedo: "toy", criança: "child", crianca: "child",
  playground: "playground", infantil: "children",

  // ── Safety & Security ──
  segurança: "security", seguranca: "security",
  vigilância: "surveillance", vigilancia: "surveillance",
  alarme: "alarm", câmera: "camera", camera: "camera",
  monitoramento: "monitoring", portaria: "reception",
  bombeiro: "firefighter", incêndio: "fire", incendio: "fire",
  extintor: "extinguisher", emergência: "emergency", emergencia: "emergency",

  // ── Government & Social ──
  governo: "government", política: "politics", politica: "politics",
  eleição: "election", eleicao: "election", voto: "vote",
  cidadania: "citizenship", comunidade: "community",
  social: "social", ong: "ngo", voluntário: "volunteer", voluntario: "volunteer",
  doação: "donation", doacao: "donation", caridade: "charity",

  // ── Energy ──
  energia: "energy", solar: "solar", elétrico: "electric", eletrico: "electric",
  eólica: "wind", eolica: "wind", hidrelétrica: "hydroelectric", hidreletrica: "hydroelectric",
  bateria: "battery", gerador: "generator", painel: "panel",

  // ── Emotions & Concepts ──
  amor: "love", felicidade: "happiness", feliz: "happy",
  paz: "peace", confiança: "trust", confianca: "trust",
  liberdade: "freedom",
  forte: "strong", novo: "new", nova: "new", melhor: "better",
  grande: "big", pequeno: "small", bonito: "beautiful",
  profissional: "professional", especial: "special", principal: "main",

  // ── Time ──
  dia: "day", noite: "night", manhã: "morning", manha: "morning",
  tarde: "afternoon", hoje: "today", amanhã: "tomorrow", amanha: "tomorrow",
  futuro: "future", momento: "moment", tempo: "time",

  // ── Actions ──
  fazer: "make", criar: "create", comprar: "buy", vender: "sell",
  ajudar: "help", transformar: "transform", conquistar: "achieve",
  contínua: "continuous", continua: "continuous", contínuo: "continuous",
  todas: "all", fases: "phases", fase: "phase",
  começar: "start", comecar: "start", terminar: "finish",
  organizar: "organize", organização: "organization", organizacao: "organization",
  desorganização: "disorganization", desorganizacao: "disorganization",
  esconde: "hides", oportunidade: "opportunity", oportunidades: "opportunities",

  // ── Adjectives ──
  luxo: "luxury", premium: "premium", exclusivo: "exclusive",
  grátis: "free", gratis: "free",
  dedicação: "dedication", dedicacao: "dedication",
  exigem: "demand", exigência: "requirement", exigencia: "requirement",
  focada: "focused", focado: "focused",
  locada: "located",
  completo: "complete", completa: "complete",
  eficiente: "efficient", eficiência: "efficiency", eficiencia: "efficiency",
  rápida: "fast", rapida: "fast",

  // ── Services ──
  serviço: "service", servico: "service", serviços: "services", servicos: "services",
  solução: "solution", solucao: "solution", soluções: "solutions", solucoes: "solutions",
  produto: "product", produtos: "products", oferta: "offer",
  promoção: "promotion", promocao: "promotion",
  desconto: "discount", gratuito: "free",
  reforma: "renovation",
  projeto: "project", plano: "plan", objetivo: "goal", meta: "goal",

  // ── Medical Equipment & Pharma ──
  equipamento: "equipment", equipamentos: "equipment",
  qualificação: "qualification", qualificacao: "qualification",
  regulamentação: "regulation", regulamentacao: "regulation",
  anvisa: "regulation", rdc: "regulation",
  laboratório: "laboratory", laboratorio: "laboratory",
  microscópio: "microscope", microscopio: "microscope",
  esterilização: "sterilization", esterilizacao: "sterilization",
  hospitalar: "hospital",

  // ── Finance ──
  banco: "bank", crédito: "credit", credito: "credit",
  empréstimo: "loan", emprestimo: "loan",
  financiamento: "financing", hipoteca: "mortgage",
  poupança: "savings", poupanca: "savings",
  câmbio: "exchange", cambio: "exchange",
  bolsa: "stock market", ação: "stock", acao: "stock",
  criptomoeda: "cryptocurrency", bitcoin: "bitcoin",
  imposto: "tax", tributo: "tax",
  orçamento: "budget", orcamento: "budget",

  // ── Communication & Media ──
  comunicação: "communication", comunicacao: "communication",
  jornalismo: "journalism", jornal: "newspaper",
  rádio: "radio", radio: "radio",
  televisão: "television", televisao: "television",
  publicidade: "advertising", propaganda: "advertising",
  assessoria: "consulting", imprensa: "press",
  mídia: "media", midia: "media",
  influenciador: "influencer", conteúdo: "content", conteudo: "content",

  // ── Textile & Crafts ──
  costura: "sewing", bordado: "embroidery", crochê: "crochet", croche: "crochet",
  tricô: "knitting", trico: "knitting", tecido: "fabric",
  estampa: "print", sublimação: "sublimation", sublimacao: "sublimation",
  camiseta: "t-shirt", uniforme: "uniform",

  // ── Common Sentence Words ──
  aqui: "here", seu: "your", sua: "your",
  nosso: "our", nossa: "our", muito: "very",
  mais: "more", menos: "less", como: "how",
  para: "for", com: "with", sem: "without",
  onde: "where", quando: "when", porque: "because",
  tudo: "everything", nada: "nothing",
  primeiro: "first", último: "last", ultimo: "last",
  mercado: "market", negócios: "business", negocios: "business",
};

// Remove accents for matching
const removeAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Words that are the same or very similar in English (cognates/loanwords)
const COGNATES = new Set([
  "pizza", "sushi", "marketing", "delivery", "fitness", "design", "diesel",
  "internet", "software", "hardware", "online", "offline", "digital",
  "premium", "gourmet", "buffet", "hotel", "motel", "resort",
  "shopping", "outlet", "fashion", "coaching", "startup", "networking",
  "bar", "pub", "club", "spa", "gym", "yoga", "pilates", "crossfit",
  "karate", "judo", "taekwondo", "kung fu",
  "rock", "pop", "jazz", "blues", "reggae", "funk", "hip hop",
  "chocolate", "cappuccino", "espresso", "latte",
  "pet", "blog", "app", "site", "email", "wifi",
  "uber", "taxi", "bus", "metro",
  "van", "pickup", "container",
  "show", "festival", "cinema", "ballet",
  "laser", "led", "solar", "diesel",
  "implant", "botox", "lifting",
]);

/**
 * Translate a Portuguese text to English keywords using a local dictionary.
 * No AI calls, zero cost.
 */
export function translateToEnglishLocal(text: string): string {
  if (!text) return text;

  const words = text
    .toLowerCase()
    .replace(/[^\w\sáàâãéèêíìîóòôõúùûçñ-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const seen = new Set<string>();
  const translated: string[] = [];

  for (const word of words) {
    const normalised = removeAccents(word);
    const eng = PT_EN[word] || PT_EN[normalised];
    if (eng) {
      if (!seen.has(eng)) {
        seen.add(eng);
        translated.push(eng);
      }
    } else if (COGNATES.has(normalised) || COGNATES.has(word)) {
      // Cognates pass through as-is
      if (!seen.has(normalised)) {
        seen.add(normalised);
        translated.push(normalised);
      }
    }
    // Words not in dictionary or cognates are dropped
  }

  // Keep max 6 keywords to avoid noisy searches
  return translated.slice(0, 6).join(" ");
}
