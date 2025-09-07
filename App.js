import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ====== форматтеры ======
const formatRUB = (n) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(+n) ? +n : 0);

const formatUSD = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(+n) ? +n : 0);

// Курс $→₽ (фиксированный, чтоб не тянуть ещё один API)
const USD_TO_RUB = 90;

// ====== метаданные монет (иконки, цвета, названия) ======
const COIN_META = {
  BTC: { name: "Bitcoin", color: "#F7931A", icon: require("./assets/btc.png") },
  ETH: { name: "Ethereum", color: "#6F42C1", icon: require("./assets/eth.png") },
  SOL: { name: "Solana", color: "#14F195", icon: require("./assets/sol.png") },
  LINK: { name: "Chainlink", color: "#2A5ADA", icon: require("./assets/link.png") },
  USDT: { name: "Tether", color: "#26A17B", icon: require("./assets/usdt.png") },
  SUI: { name: "Sui", color: "#0EA5E9", icon: require("./assets/sui.png") },
  TRX: { name: "TRON", color: "#DC2626", icon: require("./assets/trx.png") },
  DOT: { name: "Polkadot", color: "#E6007A", icon: require("./assets/dot.png") },
  ARB: { name: "Arbitrum", color: "#2E6BFF", icon: require("./assets/arb.png") },
};

// ====== стор ключ ======
const STORE_KEY = "COINBOX_PORTFOLIO_V1";

// ====== компонент иконки (без сторонних либ) ======
const CoinIcon = ({ symbol }) => {
  const meta = COIN_META[symbol];
  // простая «иконка» кружок с буквой, если картинка не найдена
  return (
    <View style={[styles.iconWrap, { backgroundColor: meta?.color || "#334155" }]}>
      <Text style={styles.iconLetter}>{symbol?.[0] || "?"}</Text>
    </View>
  );
};

// ====== главный компонент ======
export default function App() {
  const [items, setItems] = useState([]); // [{id, symbol, amount, priceRUB}]
  const [liveUSD, setLiveUSD] = useState({}); // { BTC: 60200.12, ... } — за 1 монету
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loadingPrices, setLoadingPrices] = useState(false);

  // поля формы добавления
  const [formOpen, setFormOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState(""); // ручная цена в ₽ (fallback)

  // ====== загрузка/сохранение ======
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch (e) {
        console.warn("load error", e);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  // ====== LIVE цены из Coinbase ======
  async function fetchSpotUSD(symbol) {
    const url = `https://api.coinbase.com/v2/prices/${symbol}-USD/spot`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const v = Number(json?.data?.amount);
    if (!Number.isFinite(v)) throw new Error("No amount");
    return v;
  }

  async function refreshLivePrices() {
    setLoadingPrices(true);
    try {
      const symbols = Object.keys(COIN_META);
      const results = await Promise.allSettled(symbols.map((s) => fetchSpotUSD(s)));
      const map = {};
      symbols.forEach((s, i) => {
        const r = results[i];
        if (r.status === "fulfilled" && Number.isFinite(r.value)) map[s] = r.value;
      });
      setLiveUSD(map);
      setLastUpdated(new Date());
    } catch (e) {
      console.warn("Live prices error", e);
    } finally {
      setLoadingPrices(false);
    }
  }

  useEffect(() => {
    refreshLivePrices();
    if (!autoRefresh) return;
    const id = setInterval(refreshLivePrices, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  // ====== расчёт тотала с учётом live цен ======
  const total = useMemo(() => {
    return items.reduce((sum, it) => {
      const usd = liveUSD[it.symbol];
      const unitRub = usd ? usd * USD_TO_RUB : Number(it.priceRUB || 0);
      return sum + Number(it.amount || 0) * unitRub;
    }, 0);
  }, [items, liveUSD]);

  // ====== операции с портфелем ======
  function addItem() {
    const s = symbol.trim().toUpperCase();
    const a = Number(amount);
    const p = Number(price);
    if (!s) return Alert.alert("Ошибка", "Введите символ монеты (например, BTC)");
    if (!Number.isFinite(a) || a <= 0) return Alert.alert("Ошибка", "Введите количество > 0");
    if (!Number.isFinite(p) || p <= 0) return Alert.alert("Ошибка", "Введите цену в ₽ > 0");
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setItems((prev) => [{ id, symbol: s, amount: a, priceRUB: p }, ...prev]);
    setSymbol("");
    setAmount("");
    setPrice("");
    setFormOpen(false);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  function clearAll() {
    Alert.alert("Очистить портфель?", "Действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Очистить",
        style: "destructive",
        onPress: () => setItems([]),
      },
    ]);
  }

  // ====== элемент списка ======
  const renderItem = ({ item }) => {
    const meta = COIN_META[item.symbol] || {};
    const liveUsd = liveUSD[item.symbol];
    const unitRub = liveUsd ? liveUsd * USD_TO_RUB : Number(item.priceRUB || 0);

    return (
      <View style={styles.row}>
        {/* слева */}
        <View style={styles.rowLeft}>
          <View style={[styles.iconWrap, { backgroundColor: meta.color || "#334155" }]}>
            {/* можно сюда подставить Image, если захочешь – сейчас буква */}
            <Text style={styles.iconLetter}>{item.symbol?.[0] || "?"}</Text>
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.rowTitle}>{item.symbol}</Text>
            <Text style={styles.rowSub}>{meta.name || "—"}</Text>
          </View>
        </View>

        {/* справа */}
        <View style={styles.rowRight}>
          <View style={styles.priceLine}>
            <View style={liveUsd ? styles.liveDot : styles.offDot} />
            <Text style={styles.priceNow}>
              {liveUsd
                ? `${formatUSD(liveUsd)} · ${formatRUB(unitRub)} / 1`
                : `${formatRUB(unitRub)} / 1 (ручная)`}
            </Text>
          </View>

          <Text style={styles.rowSub}>
            {item.amount} × {formatRUB(unitRub)}
          </Text>

          <View style={styles.rowTotalLine}>
            <Text style={styles.rowValue}>{formatRUB(Number(item.amount) * unitRub)}</Text>
            <TouchableOpacity onPress={() => removeItem(item.id)}>
              <Text style={styles.remove}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Хедер */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>₿ CoinBox ₿</Text>
        <Text style={styles.total}>{formatRUB(total)}</Text>
        <Text style={styles.updateText}>
          Обновлено: {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"} · Источник: Coinbase
        </Text>

        <View style={styles.topButtons}>
          <TouchableOpacity
            style={[styles.smallBtn, autoRefresh ? styles.smallBtnOn : styles.smallBtnOff]}
            onPress={() => setAutoRefresh((v) => !v)}
          >
            <Text style={styles.smallBtnText}>
              {autoRefresh ? "Авто 5 мин: ВКЛ" : "Авто 5 мин: ВЫКЛ"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.smallBtn, styles.smallBtnBlue]} onPress={refreshLivePrices}>
            <Text style={styles.smallBtnText}>{loadingPrices ? "Обновляю…" : "Обновить цены"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* список */}
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Портфель пуст. Нажми «Добавить монету».</Text>
        }
      />

      {/* нижняя панель */}
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
    </KeyboardAvoidingView>
  );
}

// ====== стили ======
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B1220" },

  header: { paddingTop: 44, paddingHorizontal: 20, paddingBottom: 12, alignItems: "center" },
  headerTitle: { fontSize: 28, fontWeight: "800", color: "#F2C94C", letterSpacing: 0.5 },
  total: { marginTop: 6, fontSize: 22, fontWeight: "800", color: "#FFFFFF" },
  updateText: { marginTop: 6, color: "#cbd5e1", fontSize: 12 },

  topButtons: { marginTop: 10, flexDirection: "row", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  smallBtnOn: { backgroundColor: "#14532D" },
  smallBtnOff: { backgroundColor: "#334155" },
  smallBtnBlue: { backgroundColor: "#1D4ED8" },
  smallBtnText: { color: "#E5E7EB", fontWeight: "700" },

  empty: { textAlign: "center", color: "#94a3b8", marginTop: 60 },

  row: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#111827",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  rowLeft: { flexDirection: "row", alignItems: "center" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  iconLetter: { color: "#0B1220", fontWeight: "900" },

  rowTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  rowSub: { color: "#9CA3AF", fontSize: 12, marginTop: 2 },

  rowRight: { alignItems: "flex-end" },
  priceLine: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  liveDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6, backgroundColor: "#22c55e" },
  offDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6, backgroundColor: "#9ca3af" },
  priceNow: { color: "#E5E7EB", fontWeight: "700" },

  rowTotalLine: { marginTop: 2, flexDirection: "row", alignItems: "center", gap: 8 },
  rowValue: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  remove: { color: "#ef4444", fontSize: 18, marginLeft: 6 },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "#0B1220",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  footerRow: { flexDirection: "row", gap: 12 },
  clearBtn: {
    flex: 1,
    backgroundColor: "#334155",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  clearText: { color: "#E5E7EB", fontWeight: "800" },
  primaryBtn: {
    flex: 1.2,
    backgroundColor: "#0EA5E9",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryText: { color: "white", fontWeight: "800" },

  form: { gap: 8 },
  input: {
    backgroundColor: "#111827",
    color: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  addBtn: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  addBtnText: { color: "white", fontWeight: "800" },
});
