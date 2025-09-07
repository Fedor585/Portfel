
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
  const [refreshing, setRefreshing] = useState(false);

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
    // 1) open.er-api.com
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await r.json();
      const v = Number(j?.rates?.RUB);
      if (Number.isFinite(v) && v > 0) {
        setUsdRub(v);
        return;
      }
    } catch (_) {}

    // 2) exchangerate.host
    try {
      const r = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=RUB");
      const j = await r.json();
      const v = Number(j?.rates?.RUB);
      if (Number.isFinite(v) && v > 0) {
        setUsdRub(v);
        return;
      }
    } catch (_) {}

    // 3) fallback через CoinGecko (USDT≈USD)
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=rub");
      const j = await r.json();
      const v = Number(j?.tether?.rub);
      if (Number.isFinite(v) && v > 0) {
        setUsdRub(v);
        return;
      }
    } catch (_) {}
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

  const usdtRub = useMemo(() => usdRub, [usdRub]);

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

  ======= RENDER ======== */
  const topPad = Platform.OS === "android" ? (StatusBar.currentHeight || 0) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
      {topPad ? <View style={{ height: topPad, backgroundColor: "#0B1220" }} /> : null}

      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* заголовок */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>₿ CoinBox ₿</Text>
          <View style={styles.badgeRow}>
            <View style={styles.usdtBadge}>
              <Text style={styles.usdtBadgeText}>USD/RUB</Text>
              <Text style={styles.usdtBadgeValue}>{usdRub.toFixed(2)} ₽</Text>
            </View>
          </View>
          <Text style={styles.updateText} numberOfLines={1}>
            Обновлено: {lastMarketUpdate ? lastMarketUpdate.toLocaleTimeString() : "—"}
          </Text>
        </View>

        <FlatList
          data={SYMBOLS}
          keyExtractor={(s) => s}
          renderItem={({ item }) => <MarketRow sym={item} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} />}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

/* ========= СТИЛИ ========= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },
  header: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6, alignItems: "center" },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#F2C94C" },
  badgeRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  usdtBadge: { flexDirection: "row", alignItems: "center", columnGap: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#14532D", borderRadius: 100 },
  usdtBadgeText: { color: "#86efac", fontWeight: "900" },
  usdtBadgeValue: { color: "#E5E7EB", fontWeight: "800" },
  updateText: { color: "#94a3b8", fontSize: 12, marginTop: 6 },
  row: {
    marginHorizontal: 16, marginVertical: 8, padding: 14, borderRadius: 16,
    backgroundColor: "#111827", flexDirection: "row", justifyContent: "space-between",
    alignItems: "center",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  iconImg: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#0B1220" },
  rowTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  rowSub: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },
  priceBlock: { alignItems: "flex-end", rowGap: 2 },
  priceNow: { color: "#E5E7EB", fontWeight: "800", fontSize: 14 },
  priceRub: { color: "#9CA3AF", fontSize: 11 },
  pill: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1 },
});
