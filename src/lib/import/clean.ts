import { squash } from "./text";

/** Primeira letra de cada palavra maiúscula ("FARMACIA ZERO HORA" → "Farmacia Zero Hora"). */
function titleCase(s: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "em"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Marcas conhecidas: prefixo/trecho do banco → nome amigável. */
const BRANDS: [RegExp, string][] = [
  [/^dl\s*\*\s*uber\s*rides?\b/i, "Uber"],
  [/^uber\b(\s*(trip|rides?|\*.*))?$/i, "Uber"],
  [/^uber\s*\*?\s*eats\b/i, "Uber Eats"],
  [/^99\s*(app|pop|taxi|tecnologia)?\b/i, "99"],
  [/^ifd\s*\*|^ifood\b/i, "iFood"],
  [/^jet\s+patinetes\b/i, "Jet Patinetes"],
  [/^tembici\b/i, "Tembici"],
  [/^netflix/i, "Netflix"],
  [/^spotify/i, "Spotify"],
  [/^amazon\s*prime|^prime\s*video/i, "Amazon Prime"],
  [/^amazon|^amzn/i, "Amazon"],
  [/^mercado\s*livre|^mercadolivre/i, "Mercado Livre"],
  [/^google\s*\*?\s*youtube|^youtube/i, "YouTube"],
  [/^apple\.com|^apple\s/i, "Apple"],
  [/^ingresso\.com/i, "Ingresso.com"],
];

/**
 * Deixa a descrição legível:
 * "Uber - NuPay" → "Uber", "MP *OLIMAO" → "Olimao", "DL *UberRides" → "Uber",
 * "IFD*60291193 JEFFERSON" → "iFood · Jefferson".
 */
export function cleanDescription(raw: string): string {
  let s = squash(raw)
    .replace(/\s*-\s*nupay$/i, "")
    .replace(/^pg\s*\*\s*/i, "")
    .replace(/^ec\s*\*\s*/i, "")
    .replace(/^pag\s*\*\s*/i, "");

  // Mercado Pago como intermediador: "MP *ACAICBX", "MP*OLIMAO", "Mp *Moema".
  s = s.replace(/^mp\s*\*\s*/i, "");

  // iFood: "IFD*60291193 JEFFERSON" → "iFood · Jefferson"
  const ifd = /^ifd\s*\*\s*\d*\s*(.*)$/i.exec(s);
  if (ifd) {
    const rest = squash(ifd[1].replace(/\d{5,}/g, ""));
    return rest ? `iFood · ${titleCase(rest)}` : "iFood";
  }

  for (const [re, name] of BRANDS) if (re.test(s)) return name;

  // Só maiúsculas (padrão de maquininha) → título; texto já misto fica como está.
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) s = titleCase(s);
  return s.replace(/\*\s*/g, " ").replace(/\s+/g, " ").trim() || squash(raw);
}

/** Chave do estabelecimento para lembrar a categoria (sem acentos, números e símbolos). */
export function merchantKey(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/·.*$/, "") // "iFood · Jefferson" → "ifood"
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** Palavras-chave → nome da categoria padrão (as categorias criadas na instalação). */
const KEYWORDS: [RegExp, string][] = [
  [/\b(uber|99|cabify|patinete|tembici|bike|metro|metrô|onibus|ônibus|estacionamento|estapar|sem parar|veloe|posto|combustivel|shell|ipiranga|petrobras|br mania|recarga bilhete|kim tecnologia em mob)\b/i, "Transporte"],
  [/\b(ifood|uber eats|rappi|restaurante|lanchonete|lanche|pizzaria|pizza|burger|hamburg|bk |mcdonald|mc donald|subway|padaria|cafe|café|acai|açaí|sorvete|bar |churrasc|diskentrega|delivery|olimao)\b/i, "Alimentação"],
  [/\b(assai|atacadista|atacadao|atacadão|carrefour|supermercado|mercado(?! ?livre| ?pago)|hortifruti|pao de acucar|extra|gbarbosa|big bompreco)\b/i, "Mercado"],
  [/\b(farmacia|farmácia|drogaria|droga|raia|pague menos|panvel|hospital|clinica|clínica|laboratorio|laboratório|odonto|medic)\b/i, "Saúde"],
  [/\b(netflix|spotify|youtube|prime|disney|hbo|globoplay|deezer|icloud|google one|apple|chatgpt|openai|claude|assinatura|leitura)\b/i, "Assinaturas"],
  [/\b(cinema|ingresso|cinemark|show|teatro|steam|playstation|xbox|nintendo|parque)\b/i, "Lazer"],
  [/\b(amazon|mercado livre|shopee|shein|aliexpress|magalu|magazine|americanas|renner|riachuelo|c&a|zara|centauro|netshoes|loja)\b/i, "Compras"],
  [/\b(claro|vivo|tim|oi |internet|telefone)\b/i, "Internet e telefone"],
  [/\b(curso|udemy|alura|escola|faculdade|livraria|livro)\b/i, "Educação"],
  [/\b(hotel|airbnb|booking|decolar|latam|gol |azul|passagem|viagem)\b/i, "Viagem"],
  [/\b(luz|energia|coelba|enel|cemig|agua|água|embasa|sabesp|gas |gás)\b/i, "Contas da casa"],
];

/** Sugere o NOME da categoria pela descrição (sem regra aprendida). */
export function suggestCategoryName(description: string): string | null {
  const text = ` ${description.normalize("NFC")} `;
  for (const [re, name] of KEYWORDS) if (re.test(text)) return name;
  return null;
}
