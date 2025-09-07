import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, StatusBar, Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ========= форматтеры ========= */
const fmtRUB = (n) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 })
    .format(Number.isFinite(+n) ? +n : 0);
const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number.isFinite(+n) ? +n : 0);

/* ========= монеты, цвета, иконки + соответствия CoinGecko ========= */
const COIN_META = {
  BTC: { id: "bitcoin",  name: "Bitcoin",  color: "#F7931A", icon: require("./assets/btc.png") },
  ETH: { id: "ethereum", name: "Ethereum", color: "#6F42C1", icon: require("./assets/eth.png") },
  SOL: { id: "solana",   name: "Solana",   color: "#14F195", icon: require("./assets/sol.png") },
  LINK:{ id: "chainlink",name: "Chainlink",color: "#2A5ADA", icon: require("./assets/link.png") },
  USDT:{ id: "tether",   name: "Tether",   color: "#26A17B", icon: require("./assets/usdt.png") },
  SUI: { id: "sui",      name: "Sui",      color: "#0EA5E9", icon: require("./assets/sui.png") },
  TRX: { id: "tron",     name: "TRON",     color: "#DC2626", icon: require("./assets/trx.png") },
  DOT: { id: "polkadot", name: "Polkadot", color: "#E6007A", icon: require("./assets/dot.png") },
  ARB: { id: "arbitrum", name: "Arbitrum", color: "#2E6BFF", icon: require("./assets/arb.png") },
};
const SYMBOLS = Object.keys(COIN_META);
const GECKO_IDS = SYMBOLS.map((s) => COIN_META[s].id).join(",");

const STORE_KEY = "COINBOX_PORTFOLIO_V1";

export default function App() {
  const [tab, setTab] = useState("market");

  /* ======== MARKET ======== */
  const [period, setPeriod] = useState("24h");
  const [usdRub, setUsdRub] = useState(90);
  const [market, setMarket] = useState({});
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [lastMarketUpdate, setLastMarketUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  /* ======== PORTFOLIO ======== */
  const [items, setItems] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  /* ======== storage ======== */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch {}
    })();
  }, []);
  useEffect(() => { AsyncStorage.setItem(STORE_KEY, JSON.stringify(items)).catch(() => {}); }, [items]);

  /* ======== API ======== */
  async function fetchUsdRub() {
    const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=RUB");
    const j = await r.json();
    const v = Number(j?.rates?.RUB);
    if (Number.isFinite(v)) setUsdRub(v);
  }
  async function fetchMarket() {
    setLoadingMarket(true);
    try {
      const url =
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
          GECKO_IDS
        )}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
      const r = await fetch(url, { headers: { "x-cg-demo-api-key": "" } });
      const arr = await r.json();
      const map = {};
      for (const row of arr) {
        const entry = Object.entries(COIN_META).find(([, v]) => v.id === row.id);
        if (!entry) continue;
        const sym = entry[0];
        const usd = Number(row.current_price);
        map[sym] = {
          usd,
          rub: usd * usdRub,
          chg24: Number(row.price_change_percentage_24h_in_currency ?? row.price_change_percentage_24h),
          chg7d: Number(row.price_change_percentage_7d_in_currency),
          chg30d: Number(row.price_change_percentage_30d_in_currency),
        };
      }
      setMarket(map);
      setLastMarketUpdate(new Date());
    } catch (e) {
      console.warn("market fetch error", e);
    } finally {
      setLoadingMarket(false);
    }
  }
  async function refreshAll() {
    await fetchUsdRub();
    await fetchMarket();
  }
  useEffect(() => {
    refreshAll();
    if (!autoRefresh) return;
    const id = setInterval(refreshAll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  /* ======== вычисления ======== */
  const totalRub = useMemo(() => {
    return items.reduce((sum, it) => {
      const live = market[it.symbol];
      const unitRub = live ? live.rub : Number(it.priceRUB || 0);
      return sum + Number(it.amount || 0) * unitRub;
    }, 0);
  }, [items, market]);

  const usdtRub = useMemo(() => (market.USDT?.usd ?? 1) * usdRub, [market, usdRub]);

  /* ======== действия портфеля ======== */
  function addItem() {
    const s = symbol.trim().toUpperCase();
    const a = Number(amount);
    const p = Number(price);
    if (!s) return Alert.alert("Ошибка", "Введите символ (например, BTC)");
    if (!Number.isFinite(a) || a <= 0) return Alert.alert("Ошибка", "Количество должно быть > 0");
    if (!Number.isFinite(p) || p <= 0) return Alert.alert("Ошибка", "Цена ₽ должна быть > 0");
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setItems((prev) => [{ id, symbol: s, amount: a, priceRUB: p }, ...prev]);
    setSymbol(""); setAmount(""); setPrice(""); setFormOpen(false);
  }
  const removeItem = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
  function clearAll() {
    Alert.alert("Очистить портфель?", "Действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      { text: "Очистить", style: "destructive", onPress: () => setItems([]) },
    ]);
  }

  /* ======== UI helpers ======== */
  const PLabel = ({ val }) => {
    const good = Number(val) >= 0;
    return (
      <View style={[styles.pill, { backgroundColor: good ? "#064e3b" : "#5b2330", borderColor: good ? "#10b981" : "#ef4444" }]}>
        <Text style={{ color: good ? "#a7f3d0" : "#fecaca", fontWeight: "800" }}>
          {Number.isFinite(val) ? `${val.toFixed(2)}%` : "—"}
        </Text>
      </View>
    );
  };

  const MarketRow = ({ sym }) => {
    const meta = COIN_META[sym];
    const m = market[sym];
    const change =
      period === "24h" ? m?.chg24 :
      period === "7d"  ? m?.chg7d :
                         m?.chg30d;

    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          {/* ИКОНКА PNG вместо кружка */}
          <Image source={meta.icon} style={styles.iconImg} />
          <View style={{ marginLeft: 10, minWidth: 64 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{sym}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{meta.name}</Text>
          </View>
        </View>

        {/* правый блок — одна строка, авто-уменьшение */}
        <View style={styles.priceBlock}>
          <Text
            style={styles.priceNow}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {m ? `${fmtUSD(m.usd)} • ${fmtRUB(m.rub)}` : "—"}
          </Text>
          <PLabel val={change} />
        </View>
      </View>
    );
  };

  const PortfolioRow = ({ item }) => {
    const meta = COIN_META[item.symbol] || {};
    const m = market[item.symbol];
    const unitRub = m ? m.rub : Number(item.priceRUB || 0);

    return (
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Image source={meta.icon ?? null} style={styles.iconImg} />
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.rowTitle}>{item.symbol}</Text>
            <Text style={styles.rowSub}>{meta.name || "—"}</Text>
          </View>
        </View>
        <View style={styles.priceBlock}>
          <Text style={styles.rowSub} numberOfLines={1}>{item.amount} × {fmtRUB(unitRub)}</Text>
          <Text style={styles.rowValue} numberOfLines={1}>{fmtRUB(unitRub * Number(item.amount || 0))}</Text>
          <TouchableOpacity onPress={() => removeItem(item.id)}>
            <Text style={styles.remove}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* ======== RENDER ======== */
  const topPad = Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
      {topPad ? <View style={{ height: topPad, backgroundColor: "#0B1220" }} /> : null}

      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* топ-навигация */}
        <View style={styles.nav}>
          <TouchableOpacity style={[styles.tab, tab === "market" && styles.tabActive]} onPress={() => setTab("market")}>
            <Text style={[styles.tabText, tab === "market" && styles.tabTextActive]}>Цены</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === "portfolio" && styles.tabActive]} onPress={() => setTab("portfolio")}>
            <Text style={[styles.tabText, tab === "portfolio" && styles.tabTextActive]}>Портфель</Text>
          </TouchableOpacity>
        </View>

        {/* заголовок */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>₿ CoinBox ₿</Text>
          <View style={styles.badgeRow}>
            <View style={styles.usdtBadge}>
              <Text style={styles.usdtBadgeText}>USDT₽</Text>
              <Text style={styles.usdtBadgeValue}>{fmtRUB(usdtRub)}</Text>
            </View>
            <TouchableOpacity style={[styles.smallBtn, styles.smallBtnBlue]} onPress={refreshAll}>
              <Text style={styles.smallBtnText}>{loadingMarket ? "Обновляю…" : "Обновить"}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.updateText} numberOfLines={1}>
            Обновлено: {lastMarketUpdate ? lastMarketUpdate.toLocaleTimeString() : "—"}
          </Text>
        </View>

        {/* экран ЦЕНЫ */}
        {tab === "market" && (
          <>
            <View style={styles.segment}>
              {["24h", "7d", "30d"].map((p) => (
                <TouchableOpacity key={p} style={[styles.segBtn, period === p && styles.segBtnActive]} onPress={() => setPeriod(p)}>
                  <Text style={[styles.segText, period === p && styles.segTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.segBtn, autoRefresh ? styles.segAutoOn : styles.segAutoOff]}
                onPress={() => setAutoRefresh((v) => !v)}
              >
                <Text style={[styles.segText, { fontSize: 12 }]}>{autoRefresh ? "Авто 5м ✓" : "Авто 5м ✗"}</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={SYMBOLS}
              keyExtractor={(s) => s}
              renderItem={({ item }) => <MarketRow sym={item} />}
              contentContainerStyle={{ paddingBottom: 120 }}
            />
          </>
        )}

        {/* экран ПОРТФЕЛЬ */}
        {tab === "portfolio" && (
          <>
            <Text style={[styles.total, { textAlign: "center" }]}>{fmtRUB(totalRub)}</Text>
            <FlatList
              data={items}
              keyExtractor={(x) => x.id}
              renderItem={PortfolioRow}
              ListEmptyComponent={<Text style={styles.empty}>Портфель пуст. Нажми «Добавить монету».</Text>}
              contentContainerStyle={{ paddingBottom: 140 }}
            />
            <View style={styles.footer}>
              {formOpen ? (
                <View style={styles.form}>
                  <TextInput
                    style={[styles.input, { width: 90 }]}
                    placeholder="BTC"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="characters"
                    value={symbol}
                    onChangeText={(t) => setSymbol(t.toUpperCase())}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Кол-во"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Цена ₽ (fallback)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={price}
                    onChangeText={setPrice}
                  />
                  <TouchableOpacity style={[styles.addBtn, { backgroundColor: "#22c55e" }]} onPress={addItem}>
                    <Text style={styles.addBtnText}>Сохранить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.addBtn, { backgroundColor: "#475569" }]} onPress={() => setFormOpen(false)}>
                    <Text style={styles.addBtnText}>Отмена</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.footerRow}>
                  <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
                    <Text style={styles.clearText}>Очистить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={() => setFormOpen(true)}>
                    <Text style={styles.primaryText}>Добавить монету</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/* ========= СТИЛИ ========= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },

  nav: { flexDirection: "row", marginTop: 12, marginHorizontal: 12, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#1f2937" },
  tab: { flex: 1, paddingVertical: 10, backgroundColor: "#0B1220", alignItems: "center" },
  tabActive: { backgroundColor: "#111827" },
  tabText: { color: "#94a3b8", fontWeight: "700" },
  tabTextActive: { color: "#e5e7eb" },

  header: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6, alignItems: "center" },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#F2C94C" },

  badgeRow: { flexDirection: "row", alignItems: "center", marginTop: 8, columnGap: 10 },
  usdtBadge: { flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#14532D", borderRadius: 100 },
  usdtBadgeText: { color: "#86efac", fontWeight: "900" },
  usdtBadgeValue: { color: "#E5E7EB", fontWeight: "800" },
  smallBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  smallBtnBlue: { backgroundColor: "#1D4ED8" },
  smallBtnText: { color: "#E5E7EB", fontWeight: "800" },

  updateText: { color: "#94a3b8", fontSize: 12, marginTop: 6 },

  segment: { flexDirection: "row", columnGap: 8, paddingHorizontal: 12, marginTop: 10, justifyContent: "center", flexWrap: "wrap" },
  segBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 9999, borderWidth: 1, borderColor: "#374151" },
  segBtnActive: { backgroundColor: "#111827", borderColor: "#1f2937" },
  segAutoOn: { backgroundColor: "#14532D", borderColor: "#14532D" },
  segAutoOff:{ backgroundColor: "#374151", borderColor: "#374151" },
  segText: { color: "#d1d5db", fontWeight: "800" },
  segTextActive: { color: "#fff" },

  row: {
    marginHorizontal: 16, marginVertical: 8, padding: 14, borderRadius: 16,
    backgroundColor: "#111827", flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  iconImg: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#0B1220" },

  rowTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  rowSub: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },

  /* правый блок: ограничили ширину, чтобы не давал переносы */
  priceBlock: { maxWidth: "56%", alignItems: "flex-end", rowGap: 4 },
  priceNow: { color: "#E5E7EB", fontWeight: "800" },

  pill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },

  total: { marginTop: 8, fontSize: 22, fontWeight: "800", color: "#FFFFFF" },
  rowValue: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  remove: { color: "#ef4444", fontSize: 18, marginTop: 4 },

  empty: { textAlign: "center", color: "#94a3b8", marginTop: 60 },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: 12,
    backgroundColor: "#0B1220", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)",
  },
  footerRow: { flexDirection: "row", columnGap: 12 },
  clearBtn: { flex: 1, backgroundColor: "#334155", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  clearText: { color: "#E5E7EB", fontWeight: "800" },
  primaryBtn: { flex: 1.2, backgroundColor: "#0EA5E9", paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  primaryText: { color: "white", fontWeight: "800" },

  form: { rowGap: 8 },
  input: {
    backgroundColor: "#111827", color: "#E5E7EB",
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
  },
  addBtn: { alignItems: "center", paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  addBtnText: { color: "white", fontWeight: "800" },
});
