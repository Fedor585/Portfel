import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, StatusBar, Image, RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ========= форматтеры ========= */
const fmtRUB = (n) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 })
    .format(Number.isFinite(+n) ? +n : 0);
const fmtUSD = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    .format(Number.isFinite(+n) ? +n : 0);

/* ========= монеты ========= */
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

  const [period, setPeriod] = useState("24h");
  const [usdRub, setUsdRub] = useState(90);
  const [market, setMarket] = useState({});
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [lastMarketUpdate, setLastMarketUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      const r = await fetch(url);
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
      setRefreshing(false);
    }
  }
  async function refreshAll() {
    setRefreshing(true);
    await fetchUsdRub();
    await fetchMarket();
    setRefreshing(false);
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

  /* ======== UI ======== */
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
            <Text style={styles.rowTitle}>{sym}</Text>
            <Text style={styles.rowSub}>{meta.name}</Text>
          </View>
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.priceNow}>{m ? fmtUSD(m.usd) : "—"}</Text>
          <Text style={styles.priceRub}>{m ? fmtRUB(m.rub) : ""}</Text>
        </View>
        <PLabel val={change} />
      </View>
    );
  };

  /* ======== render ======== */
  const topPad = Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
      {topPad ? <View style={{ height: topPad }} /> : null}

      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* навигация */}
        <View style={styles.nav}>
          <TouchableOpacity style={[styles.tab, tab === "market" && styles.tabActive]} onPress={() => setTab("market")}>
            <Text style={[styles.tabText, tab === "market" && styles.tabTextActive]}>Цены</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === "portfolio" && styles.tabActive]} onPress={() => setTab("portfolio")}>
            <Text style={[styles.tabText, tab === "portfolio" && styles.tabTextActive]}>Портфель</Text>
          </TouchableOpacity>
        </View>

        {/* шапка */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>₿ CoinBox ₿</Text>
          <View style={styles.badgeRow}>
            <View style={styles.usdtBadge}>
              <Text style={styles.usdtBadgeText}>USD/RUB</Text>
              <Text style={styles.usdtBadgeValue}>{usdRub.toFixed(2)}</Text>
            </View>
          </View>
          <Text style={styles.updateText}>
            Обновлено: {lastMarketUpdate ? lastMarketUpdate.toLocaleTimeString() : "—"}
          </Text>
        </View>

        {/* рынок */}
        {tab === "market" && (
          <FlatList
            data={SYMBOLS}
            keyExtractor={(s) => s}
            renderItem={({ item }) => <MarketRow sym={item} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}

        {/* портфель */}
        {tab === "portfolio" && (
          <>
            <Text style={styles.total}>{fmtRUB(totalRub)}</Text>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

/* ========= стили ========= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },

  nav: { flexDirection: "row", margin: 12, borderRadius: 14, borderWidth: 1, borderColor: "#1f2937" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#111827" },
  tabText: { color: "#94a3b8", fontWeight: "700" },
  tabTextActive: { color: "#e5e7eb" },

  header: { alignItems: "center", marginVertical: 10 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#F2C94C" },

  badgeRow: { flexDirection: "row", marginTop: 8 },
  usdtBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#14532D", padding: 8, borderRadius: 20 },
  usdtBadgeText: { color: "#86efac", fontWeight: "900", marginRight: 6 },
  usdtBadgeValue: { color: "#fff", fontWeight: "800" },

  updateText: { color: "#94a3b8", fontSize: 12, marginTop: 6 },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, marginHorizontal: 16, marginVertical: 6, borderRadius: 14, backgroundColor: "#111827" },
  rowLeft: { flexDirection: "row", alignItems: "center" },
  iconImg: { width: 32, height: 32, borderRadius: 16 },

  rowTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  rowSub: { color: "#9CA3AF", fontSize: 12 },

  priceBlock: { alignItems: "flex-end", marginRight: 8 },
  priceNow: { color: "#fff", fontWeight: "800" },
  priceRub: { color: "#9CA3AF", fontSize: 11 },

  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  total: { color: "#fff", fontSize: 20, fontWeight: "800", textAlign: "center", marginTop: 20 },
});
