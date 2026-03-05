import axios from "axios";

function qlUrl(base: string, route: string, inputObj: unknown) {
  const input = encodeURIComponent(JSON.stringify(inputObj));
  return `${base}/${route}?input=${input}`;
}

export async function qlGetItem(p: { base: string; id: string; language: string }) {
  const url = qlUrl(p.base, "database.getItem", { id: p.id, language: p.language });
  const res = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    timeout: 15000,
  });
  return res.data;
}

export async function qlGetItems(p: { base: string; route: string; input: any }) {
  const url = qlUrl(p.base, p.route, p.input);
  const res = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
    timeout: 15000,
  });
  return res.data;
}
