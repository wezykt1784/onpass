// PDF spec book (S24). Same information as the Ten Kites book, our own layout, colours from tokens.json.
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import tokens from "@/design/tokens.json";
import { allergenNames, dateUk, dietNames, qty } from "../format";
import type { getSpecBookData } from "../data";
import { uploadsDir } from "../data/store";
import type { Recipe } from "../types";

type Data = NonNullable<Awaited<ReturnType<typeof getSpecBookData>>>;
const c = tokens.color;
const fontDir = path.join(process.cwd(), "assets", "pdf-fonts");

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: "Manrope",
    fonts: [
      { src: path.join(fontDir, "manrope-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "manrope-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(fontDir, "manrope-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({ family: "Plex Mono", src: path.join(fontDir, "ibm-plex-mono-latin-500-normal.woff") });
  Font.registerHyphenationCallback((w) => [w]); // never hyphenate ingredient names
  fontsReady = true;
}

const s = StyleSheet.create({
  page: { fontFamily: "Manrope", fontSize: 9, color: c.text, paddingBottom: 30 },
  header: { backgroundColor: c.ink, color: c["on-ink"], flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 22, gap: 8 },
  headerTitle: { fontSize: 13, fontWeight: 700, flexShrink: 1 },
  code: { fontFamily: "Plex Mono", fontSize: 8.5 },
  chip: { borderWidth: 1, borderColor: c["on-ink"], borderRadius: 99, paddingVertical: 2, paddingHorizontal: 7, fontSize: 7.5, fontWeight: 600 },
  orgName: { marginLeft: "auto", fontSize: 8.5, fontWeight: 600 },
  body: { flexDirection: "row", gap: 18, paddingHorizontal: 22, paddingTop: 14 },
  grow: { flexGrow: 1 },
  col: { flex: 1 },
  photo: { width: 190, height: 140, objectFit: "cover", borderRadius: 6, marginBottom: 10 },
  panelHead: { backgroundColor: c.surface, fontWeight: 700, fontSize: 9.5, paddingVertical: 5, paddingHorizontal: 7, borderRadius: 3, marginBottom: 4 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 4, color: c["text-muted"], fontSize: 7.5, fontWeight: 600 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: c.border, paddingVertical: 4 },
  cName: { flex: 3.2, paddingRight: 6 },
  cSup: { flex: 2, paddingRight: 6 },
  cCode: { flex: 1.6, paddingRight: 6 },
  cQty: { flex: 1, textAlign: "right" },
  step: { flexDirection: "row", gap: 6, marginBottom: 5, lineHeight: 1.45 },
  stepN: { width: 12, fontWeight: 700 },
  bars: { flexDirection: "row", gap: 12, paddingHorizontal: 22, marginTop: 12 },
  bar: { borderRadius: 5, paddingVertical: 7, paddingHorizontal: 9 },
  barText: { fontSize: 9.5, fontWeight: 700, lineHeight: 1.35 },
  footer: { position: "absolute", bottom: 12, left: 22, right: 22, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: c["text-muted"] },
  batchTitle: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  batchMeta: { fontSize: 8, color: c["text-muted"], marginBottom: 6 },
});

function photoSrc(p: string | null) {
  if (!p || !/\.(jpg|png)$/.test(p)) return null;
  const file = path.join(uploadsDir, p);
  if (!fs.existsSync(file)) return null;
  return { data: fs.readFileSync(file), format: p.endsWith(".png") ? ("png" as const) : ("jpg" as const) };
}

function Ingredients({ r, d }: { r: Recipe; d: Data }) {
  return (
    <View>
      <View style={s.th}>
        <Text style={s.cName}>Name</Text><Text style={s.cSup}>Supplier</Text><Text style={s.cCode}>Code</Text><Text style={s.cQty}>Quantity</Text>
      </View>
      {r.lines.map((l) => {
        const p = l.productId ? d.products.get(l.productId) : null;
        const sub = l.subRecipeId ? d.recipes.get(l.subRecipeId) : null;
        return (
          <View key={l.id} style={s.tr} wrap={false}>
            <Text style={[s.cName, sub ? { fontWeight: 600 } : {}]}>{p?.name ?? sub?.name ?? "Missing"}</Text>
            <Text style={s.cSup}>{p?.supplierId ? d.suppliers.get(p.supplierId)?.name ?? "" : ""}</Text>
            <Text style={[s.cCode, s.code]}>{p?.supplierCode ?? ""}</Text>
            <Text style={s.cQty}>{qty(l.quantity, l.unit)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Method({ r }: { r: Recipe }) {
  if (!r.method.length) return <Text style={{ color: c["text-muted"] }}>No method written yet.</Text>;
  return (
    <View>
      {r.method.map((m, i) => (
        <View key={i} style={s.step} wrap={false}>
          <Text style={s.stepN}>{i + 1}.</Text>
          <Text style={{ flex: 1 }}>{m.text}</Text>
        </View>
      ))}
    </View>
  );
}

function Bar({ bg, fg, border, dashed, children }: { bg?: string; fg: string; border?: string; dashed?: boolean; children: string }) {
  return (
    <View style={[s.bar, bg ? { backgroundColor: bg } : {}, border ? { borderWidth: 1, borderColor: border, borderStyle: dashed ? "dashed" : "solid" } : {}]}>
      <Text style={[s.barText, { color: fg }]}>{children}</Text>
    </View>
  );
}

function Footer({ printed, label }: { printed: string; label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{label} · Printed {printed}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function SpecBook({ d }: { d: Data }) {
  const printed = dateUk(new Date().toISOString());
  const book = d.menu.displayName ? `${d.menu.name}` : d.menu.name;
  return (
    <Document title={`${d.menu.name} spec book`} author={d.org.name} creator="Spec">
      <Page size="A4" orientation="landscape" style={[s.page, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ fontSize: 14, fontWeight: 600, color: c["text-muted"], marginBottom: 10 }}>{d.org.name}</Text>
        <Text style={{ fontSize: 30, fontWeight: 700 }}>{d.menu.name}</Text>
        {d.menu.menuDate && <Text style={{ fontSize: 14, marginTop: 6 }}>{dateUk(d.menu.menuDate)}</Text>}
        <Footer printed={printed} label={book} />
      </Page>

      {d.sections.map((sec, si) => [
        <Page key={`sec-${si}`} size="A4" orientation="landscape" style={[s.page, { justifyContent: "center", alignItems: "center" }]}>
          <Text style={{ fontSize: 26, fontWeight: 700 }}>{sec.title}</Text>
          <Text style={{ fontSize: 10, color: c["text-muted"], marginTop: 6 }}>{sec.dishes.length} {sec.dishes.length === 1 ? "dish" : "dishes"}</Text>
          <Footer printed={printed} label={book} />
        </Page>,
        ...sec.dishes.flatMap(({ recipe: r, displayName, rollup, batches }) => {
          const contains = allergenNames(rollup.contains, d.allergens);
          const may = allergenNames(rollup.mayContain, d.allergens);
          const diets = dietNames(rollup.diets, d.diets);
          const unknown = rollup.unknownProducts.map((id) => d.products.get(id)?.name ?? "");
          const photo = photoSrc(r.photoPath);
          return [
            <Page key={r.id} size="A4" orientation="landscape" style={s.page}>
              <View style={s.header}>
                <Text style={s.headerTitle}>{`${sec.title} // ${displayName}`}</Text>
                {r.code && <Text style={s.code}>{r.code}</Text>}
                {r.skillRating && <Text style={s.chip}>Skill: {r.skillRating[0].toUpperCase() + r.skillRating.slice(1)}</Text>}
                {r.timeRating && <Text style={s.chip}>Time: {r.timeRating[0].toUpperCase() + r.timeRating.slice(1)}</Text>}
                <Text style={s.orgName}>{d.org.name}</Text>
              </View>
              <View style={[s.body, s.grow]}>
                <View style={s.col}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- PDF images have no alt attribute */}
                  {photo && <Image style={s.photo} src={photo} />}
                  <Text style={s.panelHead}>Ingredients</Text>
                  <Ingredients r={r} d={d} />
                </View>
                <View style={s.col}>
                  <Text style={s.panelHead}>Method</Text>
                  <Method r={r} />
                </View>
              </View>
              <View style={s.bars} wrap={false}>
                <View style={{ flex: 1, gap: 6 }}>
                  {unknown.length > 0 && <Bar bg={c["unknown-bg"]} fg={c.unknown} border={c.unknown} dashed>{`Allergen data missing for: ${unknown.join(", ")}`}</Bar>}
                  {contains.length
                    ? <Bar bg={c.allergen} fg={c["on-allergen"]}>{`Allergens: ${contains.join(", ")}`}</Bar>
                    : <Bar fg={c.suitable} border={c.suitable}>No listed allergens</Bar>}
                  {may.length > 0 && <Bar bg={c["may-contain-bg"]} fg={c["may-contain"]}>{`May contain: ${may.join(", ")}`}</Bar>}
                </View>
                <View style={{ flex: 1 }}>
                  {diets.length > 0 && <Bar bg={c.suitable} fg={c["on-suitable"]}>{`Suitable for: ${diets.join(", ")}`}</Bar>}
                </View>
              </View>
              <Footer printed={printed} label={book} />
            </Page>,
            ...(batches.length
              ? [
                  <Page key={`${r.id}-b`} size="A4" orientation="landscape" style={s.page}>
                    <View style={s.header} fixed>
                      <Text style={s.headerTitle}>{`Batch recipes // ${displayName}`}</Text>
                      <Text style={s.orgName}>{d.org.name}</Text>
                    </View>
                    {batches.map((b) => (
                      <View key={b.id} style={[s.body, { marginBottom: 8 }]} wrap={false}>
                        <View style={s.col}>
                          <Text style={s.batchTitle}>{b.name}</Text>
                          <Text style={s.batchMeta}>
                            {b.code ? `${b.code} · ` : ""}Batch weight {b.yieldQty != null ? qty(b.yieldQty, b.yieldUnit ?? "") : "not set"}
                          </Text>
                          <Ingredients r={b} d={d} />
                        </View>
                        <View style={[s.col, { paddingTop: 30 }]}>
                          <Method r={b} />
                        </View>
                      </View>
                    ))}
                    <Footer printed={printed} label={book} />
                  </Page>,
                ]
              : []),
          ];
        }),
      ])}
    </Document>
  );
}

export async function renderSpecBook(d: Data): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<SpecBook d={d} />);
}
