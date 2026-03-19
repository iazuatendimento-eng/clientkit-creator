/**
 * Simple PT→EN dictionary-based translation for stock media search.
 * No AI cost — just maps common Portuguese words to English equivalents.
 */

const PT_EN: Record<string, string> = {
  // General
  saúde: "health", saude: "health", médico: "doctor", medico: "doctor",
  hospital: "hospital", clínica: "clinic", clinica: "clinic",
  dentista: "dentist", odontologia: "dentistry", sorriso: "smile",
  bem: "well", estar: "being", "bem-estar": "wellness",
  cuidado: "care", cuidados: "care", atenção: "attention", atencao: "attention",
  vida: "life", viver: "living", qualidade: "quality",
  família: "family", familia: "family", crianças: "children", criancas: "children",
  mulher: "woman", homem: "man", pessoas: "people", pessoa: "person",
  idoso: "elderly", bebê: "baby", bebe: "baby", jovem: "young",

  // Business
  empresa: "business", negócio: "business", negocio: "business",
  trabalho: "work", escritório: "office", escritorio: "office",
  equipe: "team", liderança: "leadership", lideranca: "leadership",
  sucesso: "success", crescimento: "growth", resultado: "results",
  marketing: "marketing", vendas: "sales", cliente: "client",
  digital: "digital", tecnologia: "technology", inovação: "innovation", inovacao: "innovation",
  financeiro: "financial", investimento: "investment", dinheiro: "money",

  // Food & Beverage
  comida: "food", alimento: "food", alimentação: "nutrition", alimentacao: "nutrition",
  restaurante: "restaurant", café: "coffee", cafe: "coffee",
  cozinha: "kitchen", receita: "recipe", saudável: "healthy", saudavel: "healthy",
  fruta: "fruit", legume: "vegetable", carne: "meat", peixe: "fish",

  // Education
  educação: "education", educacao: "education", escola: "school",
  universidade: "university", professor: "teacher", aluno: "student",
  aprendizado: "learning", conhecimento: "knowledge", livro: "book",
  estudo: "study", curso: "course", aula: "class",

  // Real Estate & Construction
  casa: "house", apartamento: "apartment", imóvel: "property", imovel: "property",
  construção: "construction", construcao: "construction",
  arquitetura: "architecture", decoração: "decoration", decoracao: "decoration",
  jardim: "garden", interior: "interior", moderno: "modern",

  // Nature & Environment
  natureza: "nature", meio: "environment", ambiente: "environment",
  sustentável: "sustainable", sustentavel: "sustainable",
  água: "water", agua: "water", floresta: "forest", praia: "beach",
  sol: "sun", céu: "sky", ceu: "sky", montanha: "mountain",
  animal: "animal", planta: "plant", verde: "green",

  // Fitness & Sports
  esporte: "sport", exercício: "exercise", exercicio: "exercise",
  treino: "training", academia: "gym", corrida: "running",
  musculação: "bodybuilding", musculacao: "bodybuilding",
  yoga: "yoga", pilates: "pilates", corpo: "body",

  // Beauty & Fashion
  beleza: "beauty", moda: "fashion", cabelo: "hair",
  maquiagem: "makeup", pele: "skin", rosto: "face",
  roupa: "clothing", estilo: "style", elegante: "elegant",

  // Law & Services
  advogado: "lawyer", direito: "law", justiça: "justice", justica: "justice",
  contabilidade: "accounting", contador: "accountant",
  seguro: "insurance", consultoria: "consulting",

  // Auto & Transport
  carro: "car", veículo: "vehicle", veiculo: "vehicle",
  transporte: "transport", viagem: "travel", turismo: "tourism",

  // Tech
  computador: "computer", software: "software", aplicativo: "app",
  internet: "internet", rede: "network", dados: "data",
  inteligência: "intelligence", inteligencia: "intelligence", artificial: "artificial",

  // Emotions & Concepts
  amor: "love", felicidade: "happiness", feliz: "happy",
  paz: "peace", confiança: "trust", confianca: "trust",
  segurança: "safety", seguranca: "safety", liberdade: "freedom",
  forte: "strong", novo: "new", nova: "new", melhor: "better",
  grande: "big", pequeno: "small", bonito: "beautiful",
  profissional: "professional", especial: "special", principal: "main",

  // Time
  dia: "day", noite: "night", manhã: "morning", manha: "morning",
  tarde: "afternoon", hoje: "today", amanhã: "tomorrow", amanha: "tomorrow",
  futuro: "future", momento: "moment", tempo: "time",

  // Actions
  fazer: "make", criar: "create", comprar: "buy", vender: "sell",
  ajudar: "help", transformar: "transform", conquistar: "achieve",
  contínua: "continuous", continua: "continuous", todas: "all",
  fases: "phases", fase: "phase",

  // Adjectives
  luxo: "luxury", premium: "premium", exclusivo: "exclusive",
  grátis: "free", gratis: "free",

  // Pet
  pet: "pet", cachorro: "dog", gato: "cat", veterinário: "veterinary", veterinario: "veterinary",

  // Religion
  igreja: "church", fé: "faith", fe: "faith", deus: "god", oração: "prayer", oracao: "prayer",

  // Transport & Logistics
  frete: "freight", transporte: "transport", caminhão: "truck", caminhao: "truck",
  logística: "logistics", logistica: "logistics", entrega: "delivery", envio: "shipping",
  pontualidade: "punctuality", garantida: "guaranteed", garantia: "warranty",
  exclusivo: "exclusive", sempre: "always", rápido: "fast", rapido: "fast",
  mudança: "moving", mudanca: "moving", carga: "cargo", frota: "fleet",
  rodoviário: "road", rodoviario: "road", estrada: "road", motorista: "driver",

  // More adjectives & common words
  contínuo: "continuous", continuo: "continuous",
  completo: "complete", completa: "complete",
  eficiente: "efficient", eficiência: "efficiency", eficiencia: "efficiency",
  seguro: "safe", rápida: "fast", rapida: "fast",
  serviço: "service", servico: "service", serviços: "services", servicos: "services",
  solução: "solution", solucao: "solution", soluções: "solutions", solucoes: "solutions",
  produto: "product", produtos: "products", oferta: "offer", promoção: "promotion", promocao: "promotion",
  desconto: "discount", gratuito: "free", limpeza: "cleaning", reforma: "renovation",
  projeto: "project", plano: "plan", objetivo: "goal", meta: "goal",
  energia: "energy", solar: "solar", elétrico: "electric", eletrico: "electric",
  música: "music", musica: "music", arte: "art", design: "design", foto: "photo",
  fotografia: "photography", vídeo: "video", video: "video",
  evento: "event", festa: "party", casamento: "wedding", aniversário: "birthday", aniversario: "birthday",
};

// Remove accents for matching
const removeAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Translate a Portuguese text to English keywords using a local dictionary.
 * No AI calls, zero cost.
 */
export function translateToEnglishLocal(text: string): string {
  if (!text) return text;

  const words = text
    .toLowerCase()
    .replace(/[^\\w\\sáàâãéèêíìîóòôõúùûçñ-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const seen = new Set<string>();
  const translated: string[] = [];

  for (const word of words) {
    const normalised = removeAccents(word);
    const eng = PT_EN[word] || PT_EN[normalised];
    const out = eng || word; // keep original if not found
    if (!seen.has(out)) {
      seen.add(out);
      translated.push(out);
    }
  }

  // Keep max 6 keywords to avoid noisy searches
  return translated.slice(0, 6).join(" ");
}
