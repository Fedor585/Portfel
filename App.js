import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, StatusBar, Image,
  RefreshControl, ScrollView,
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

/* ========= storage keys ========= */
const STORE_KEY = "COINBOX_PORTFOLIO_V1";
const STORE_USDRUB = "COINBOX_USDRUB_LAST";
const STORE_SETTINGS = "COINBOX_SETTINGS_V1";

/* ========= default settings ========= */
const defaultSettings = { usdRubSource: "auto", autoRefreshMin: 5, showRubLine: true };

/* ========= helpers ========= */
const fetchWithTimeout = (url, opts = {}, ms = 8000) =>
  Promise.race([
    fetch(url, opts),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

export default function App() {
  const [tab, setTab] = useState("market");

  /* ======== MARKET ======== */
  const [period, setPeriod] = useState("24h");
  const [usdRub, setUsdRub] = useState(90);
  const [market, setMarket] = useState({});
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [lastMarketUpdate, setLastMarketUpdate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  /* ======== SETTINGS ======== */
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ======== PORTFOLIO ======== */
  const [items, setItems] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  /* ======== init: portfolio + settings ======== */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch {}
      try {
        const rawS = await AsyncStorage.getItem(STORE_SETTINGS);
        if (rawS) setSettings({ ...defaultSettings, ...JSON.parse(rawS) });
      } catch {}
    })();
  }, []);
  useEffect(() => { AsyncStorage.setItem(STORE_KEY, JSON.stringify(items)).catch(() => {}); }, [items]);
  useEffect(() => { AsyncStorage.setItem(STORE_SETTINGS, JSON.stringify(settings)).catch(() => {}); }, [settings]);

  /* ======== USD/RUB (MOEX -> CBR -> EXH) with cache ======== */
  async function getUsdRubFrom(source) {
    if (source === "moex") {
      const u = "https://iss.moex.com/iss/engines/currency/markets/selt/boards/CETS/securities/USD000UTSTOM.json?iss.meta=off&iss.only=marketdata&marketdata.columns=LAST";
      const r = await fetchWithTimeout(u);
      const j = await r.json();
      return Number(j?.marketdata?.data?.[0]?.[0]);
    }
    if (source === "cbr") {
      const r = await fetchWithTimeout("https://www.cbr-xml-daily.ru/daily_json.js");
      const j = await r.json();
      return Number(j?.Valute?.USD?.Value);
    }
    // exchangerate.host
    const r = await fetchWithTimeout("https://api.exchangerate.host/latest?base=USD&symbols=RUB");
    const j = await r.json();
    return Number(j?.rates?.RUB);
  }

  async function fetchUsdRub() {
    let v = null;
    const order = settings.usdRubSource === "auto" ? ["moex", "cbr", "exh"] : [settings.usdRubSource];
    for (const src of order) {
      try {
        const val = await getUsdRubFrom(src === "exh" ? undefined : src);
        if (Number.isFinite(val) && val > 0) { v = val; break; }
      } catch {}
    }
    if (Number.isFinite(v)) {
      setUsdRub(v);
      AsyncStorage.setItem(STORE_USDRUB, JSON.stringify({ v, t: Date.now() })).catch(()=>{});
      return true;
    }
    // fallback cache
    try {
      const raw = await AsyncStorage.getItem(STORE_USDRUB);
      const obj = raw ? JSON.parse(raw) : null;
      if (obj?.v && Number.isFinite(+obj.v)) {
        setUsdRub(+obj.v);
        return true;
      }
    } catch {}
    return false;
  }

  /* ======== Market fetch ======== */
  async function fetchMarket() {
    setLoadingMarket(true);
    try {
      const url =
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(
          GECKO_IDS
        )}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
      const r = await fetchWithTimeout(url, { headers: { "x-cg-demo-api-key": "" } });
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

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await fetchUsdRub();
    await fetchMarket();
    setRefreshing(false);
  }, []);

  /* ======== автообновление ======== */
  useEffect(() => {
    refreshAll();
    if (!settings.autoRefreshMin || settings.autoRefreshMin <= 0) return;
    const id = setInterval(refreshAll, settings.autoRefreshMin * 60 * 1000);
    return () => clearInterval(id);
  }, [settings.autoRefreshMin, settings.usdRubSource]);

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
          <Image source={meta.icon} style={styles.iconImg} />
          <View style={{ marginLeft: 10, minWidth: 64 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{sym}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>{meta.name}</Text>
          </View>
        </View>

        {/* Правый блок: $ + % в одной строке; ₽ ниже меньшим шрифтом */}
        <View style={styles.priceBlock}>
          <View style={styles.usdLine}>
            <Text style={styles.priceNow} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9}>
              {m ? fmtUSD(m.usd) : "—"}
            </Text>
            <PLabel val={change} />
          </View>
          {settings.showRubLine && (
            <Text style={styles.rubNow} numberOfLines={1}>{m ? fmtRUB(m.rub) : "—"}</Text>
          )}
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

  const MarketScreen = (
    <>
      <View style={styles.segment}>
        {["24h", "7d", "30d"].map((p) => (
          <TouchableOpacity key={p} style={[styles.segBtn, period === p && styles.segBtnActive]} onPress={() => setPeriod(p)}>
            <Text style={[styles.segText, period === p && styles.segTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.segBtn, settings.autoRefreshMin ? styles.segAutoOn : styles.segAutoOff]}
          onPress={() =>
            setSettings(s => ({ ...s, autoRefreshMin: s.autoRefreshMin ? 0 : 5 }))
          }
        >
          <Text style={[styles.segText, { fontSize: 12 }]}>{settings.autoRefreshMin ? `Авто ${settings.autoRefreshMin}м ✓` : "Авто ✗"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={SYMBOLS}
        keyExtractor={(s) => s}
        renderItem={({ item }) => <MarketRow sym={item} />}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor="#fff" />}
      />
    </>
  );

  const PortfolioScreen = (
    <>
      <Text style={[styles.total, { textAlign: "center" }]}>{fmtRUB(totalRub)}</Text>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={PortfolioRow}
        ListEmptyComponent={<Text style={styles.empty}>Портфель пуст. Нажми «Добавить монету».</Text>}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor="#fff" />}
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
  );

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
              <Text style={styles.usdtBadgeText}>USD/RUB</Text>
              <Text style={styles.usdtBadgeValue}>{fmtRUB(usdRub)}</Text>
            </View>

            <TouchableOpacity onPress={() => setSettingsOpen(true)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#334155" }}>
              <Text style={{ color: "#E5E7EB", fontWeight: "900" }}>⚙︎</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.updateText} numberOfLines={1}>
            Обновлено: {lastMarketUpdate ? lastMarketUpdate.toLocaleTimeString() : "—"}
          </Text>
        </View>

        {/* контент */}
        {tab === "market" ? MarketScreen : PortfolioScreen}
      </KeyboardAvoidingView>

      {/* Модалка настроек */}
      {settingsOpen && (
        <View style={modal.s}>
          <View style={modal.card}>
            <Text style={modal.title}>Настройки</Text>

            <Text style={modal.label}>Источник USD/RUB</Text>
            <View style={modal.row}>
              {[
                {k:"auto", t:"Авто"},
                {k:"moex", t:"MOEX"},
                {k:"cbr", t:"ЦБ"},
                {k:"exh", t:"EXH"},
              ].map(opt => (
                <TouchableOpacity key={opt.k}
                  style={[modal.chip, settings.usdRubSource===opt.k && modal.chipA]}
                  onPress={()=>setSettings(s=>({...s, usdRubSource: opt.k}))}>
                  <Text style={modal.chipT}>{opt.t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modal.label}>Авто-обновление</Text>
            <View style={modal.row}>
              {[0,1,5,15].map(min => (
                <TouchableOpacity key={min}
                  style={[modal.chip, settings.autoRefreshMin===min && modal.chipA]}
                  onPress={()=>setSettings(s=>({...s, autoRefreshMin:min}))}>
                  <Text style={modal.chipT}>{min? `${min}м`:"Выкл"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[modal.toggle, settings.showRubLine && modal.toggleA]}
              onPress={()=>setSettings(s=>({...s, showRubLine: !s.showRubLine}))}>
              <Text style={modal.toggleT}>{settings.showRubLine? "₽-строка: ВКЛ":"₽-строка: ВЫКЛ"}</Text>
            </TouchableOpacity>

            <View style={{height:10}}/>
            <TouchableOpacity onPress={()=>setSettingsOpen(false)} style={modal.btn}>
              <Text style={{color:"#fff", fontWeight:"800"}}>Готово</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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

  updateText: { color: "#94a3b8", fontSize: 12, marginTop: 6 },

  segment: { flexDirection: "row", columnGap: 8, paddingHorizontal: 12, marginTop: 10, justifyContent: "center", flexWrap: "wrap" },
  segBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 9999, borderWidth: 1, borderColor: "#374151" },
  segBtnActive: { backgroundColor: "#111827", borderColor: "#1f2937" },
  segAutoOn: { backgroundColor: "#14532D", borderColor: "#14532D" },
  segAutoOff:{ backgroundColor: "#374151", borderColor: "#374151" },
  segText: { color: "#d1d5db", fontWeight: "800" },
  segTextActive: { color: "#fff" },

  row: {
    marginHorizontal: 16, marginVertical: 6, padding: 12, borderRadius: 14,
    backgroundColor: "#111827", flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  iconImg: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#0B1220" },

  rowTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  rowSub: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },

  priceBlock: { maxWidth: "54%", alignItems: "flex-end", rowGap: 2 },
  usdLine: { flexDirection: "row", alignItems: "center", columnGap: 8 },
  priceNow: { color: "#E5E7EB", fontWeight: "800" },
  rubNow: { color: "#9CA3AF", fontSize: 11 },

  pill: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 999, borderWidth: 1 },

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

/* ====== СТИЛИ модалки ====== */
const modal = StyleSheet.create({
  s:{ position:"absolute", inset:0, backgroundColor:"rgba(0,0,0,0.6)", justifyContent:"center", alignItems:"center" },
  card:{ width:"90%", backgroundColor:"#111827", borderRadius:16, padding:16, borderWidth:1, borderColor:"rgba(255,255,255,0.06)" },
  title:{ color:"#fff", fontSize:16, fontWeight:"900", marginBottom:10, textAlign:"center" },
  label:{ color:"#9CA3AF", marginTop:8, marginBottom:6, fontWeight:"700" },
  row:{ flexDirection:"row", flexWrap:"wrap", gap:8 },
  chip:{ paddingVertical:6, paddingHorizontal:12, borderRadius:999, borderWidth:1, borderColor:"#374151" },
  chipA:{ backgroundColor:"#1F2937", borderColor:"#1F2937" },
  chipT:{ color:"#E5E7EB", fontWeight:"800" },
  toggle:{ marginTop:10, padding:10, borderRadius:12, borderWidth:1, borderColor:"#374151", alignItems:"center" },
  toggleA:{ backgroundColor:"#1F2937", borderColor:"#1F2937" },
  toggleT:{ color:"#E5E7EB", fontWeight:"800" },
  btn:{ backgroundColor:"#0EA5E9", paddingVertical:12, borderRadius:12, alignItems:"center" },
});
