// App.js — CoinBox с Coinbase-ценами и автообновлением
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";

/** ====== МЕТАДАННЫЕ МОНЕТ + ИКОНКИ (пути под твою структуру: assets/*.png) ====== */
const COIN_META = {
  BTC: { name: "Bitcoin",   color: "#F7931A", icon: require("./assets/btc.png") },
  ETH: { name: "Ethereum",  color: "#6F42C1", icon: require("./assets/eth.png") },
  SOL: { name: "Solana",    color: "#14F195", icon: require("./assets/sol.png") },
  LINK:{ name: "Chainlink", color: "#2A5ADA", icon: require("./assets/link.png") },
  ARB: { name: "Arbitrum",  color: "#2D374B", icon: require("./assets/arb.png") },
  USDT:{ name: "Tether",    color: "#26A17B", icon: require("./assets/usdt.png") },
  XRP: { name: "XRP",       color: "#111111", icon: require("./assets/xrp.png") },
  TRX: { name: "TRON",      color: "#EB0029", icon: require("./assets/trx.png") }, // может не быть на Coinbase
  SUI: { name: "Sui",       color: "#3BA9FF", icon: require("./assets/sui.png") },
  DOT: { name: "Polkadot",  color: "#E6007A", icon: require("./assets/dot.png") },
};

/** Пары Coinbase для spot-цен (если пары нет — живой цены не будет, используем ручную) */
const COINBASE_PAIR = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  SOL: "SOL-USD",
  LINK: "LINK-USD",
  ARB: "ARB-USD",
  USDT: "USDT-USD",
  XRP: "XRP-USD",
  // TRX: нет пары на Coinbase — оставляем ручную цену
  SUI: "SUI-USD",
  DOT: "DOT-USD",
};

const STORAGE_KEY = "@coinbox_portfolio_v1";
const STORAGE_AUTO = "@coinbox_auto_refresh";
const USD_TO_RUB = 81; // при желании вынесем на экран настройки

const formatRUB = (n) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(
    Number.isFinite(+n) ? +n : 0
  );

const SUGGESTIONS = Object.keys(COIN_META);

/** ====== Строка списка ====== */
const Row = ({ item, liveUSD }) => {
  const meta = COIN_META[item.symbol] || {};
  const icon = meta.icon;
  const liveUsd = liveUSD[item.symbol]; // число в USD или undefined
  const priceRub = liveUsd ? liveUsd * USD_TO_RUB : Number(item.price); // показываем живую цену, если есть
  const lineTotal = Number(item.amount) * priceRub;

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon ? (
          <Image source={icon} style={styles.coinIcon} resizeMode="contain" />
        ) : (
          <View style={[styles.coinIcon, styles.coinIconFallback]}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>{item.symbol?.slice(0, 3) || "?"}</Text>
          </View>
        )}
        <View>
          <Text style={styles.rowTitle}>{item.symbol}</Text>
          <Text style={styles.rowSub}>
            {meta.name || item.name || "Custom coin"}
            {liveUsd ? " · Live" : " · Manual"}
          </Text>
        </View>
      </View>

      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{formatRUB(lineTotal)}</Text>
        <Text style={styles.rowSub}>
          {item.amount} × {formatRUB(priceRub)}
        </Text>
      </View>
    </View>
  );
};

export default function App() {
  const [items, setItems] = useState([]);               // [{id, symbol, amount, price(РУБ, ручная)}]
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");               // РУБ (ручной ввод)
  const [liveUSD, setLiveUSD] = useState({});           // { BTC: 65000, ... } — живые USD-цены
  const [autoRefresh, setAutoRefresh] = useState(true); // автообновление каждые 5 минут
  const timerRef = useRef(null);

  /** загрузка/сохранение портфеля и настроек */
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setItems(JSON.parse(raw));
        const ar = await AsyncStorage.getItem(STORAGE_AUTO);
        if (ar === "0") setAutoRefresh(false);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_AUTO, autoRefresh ? "1" : "0").catch(() => {});
  }, [autoRefresh]);

  /** суммарная стоимость (в ₽) */
  const total = useMemo(() => {
    return items.reduce((sum, it) => {
      const liveUsd = liveUSD[it.symbol];
      const priceRub = liveUsd ? liveUsd * USD_TO_RUB : Number(it.price || 0);
      return sum + Number(it.amount || 0) * priceRub;
    }, 0);
  }, [items, liveUSD]);

  /** добавление записи */
  const addItem = () => {
    const sym = symbol.trim().toUpperCase();
    const amt = Number(String(amount).replace(",", "."));
    const prc = Number(String(price).replace(",", ".")); // РУБ

    if (!sym) return Alert.alert("Монета", "Укажи тикер (например, BTC)");
    if (!Number.isFinite(amt) || amt <= 0) return Alert.alert("Количество", "Введи корректное количество");
    if (!Number.isFinite(prc) || prc < 0) return Alert.alert("Цена", "Введи корректную цену (в ₽)");

    setItems((prev) => [
      ...prev,
      { id: String(Date.now()), symbol: sym, name: COIN_META[sym]?.name || sym, amount: amt, price: prc },
    ]);
    setSymbol("");
    setAmount("");
    setPrice("");
  };

  const clearAll = () => {
    Alert.alert("Очистить портфель", "Удалить все записи?", [
      { text: "Отмена" },
      { text: "Удалить", style: "destructive", onPress: () => setItems([]) },
    ]);
  };

  /** ====== Загрузка живых цен с Coinbase ====== */
  async function fetchCoinbaseSpotUSD(pair) {
    const url = `https://api.coinbase.com/v2/prices/${pair}/spot`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const v = Number(json?.data?.amount);
    if (!Number.isFinite(v)) throw new Error("bad amount");
    return v;
  }

  async function refreshLivePrices() {
    const entries = await Promise.all(
      Object.keys(COINBASE_PAIR).map(async (sym) => {
        const pair = COINBASE_PAIR[sym];
        if (!pair) return [sym, undefined];
        try {
          const usd = await fetchCoinbaseSpotUSD(pair);
          return [sym, usd];
        } catch {
          return [sym, undefined];
        }
      })
    );
    const map = Object.fromEntries(entries.filter(Boolean));
    setLiveUSD(map);
  }

  // стартовая загрузка цен
  useEffect(() => {
    refreshLivePrices().catch(() => {});
  }, []);

  // автообновление каждые 5 минут
  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(() => {
        refreshLivePrices().catch(() => {});
      }, 5 * 60 * 1000); // 5 минут
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRefresh]);

  /** подсказки по тикерам */
  const matched = useMemo(() => {
    const s = symbol.trim().toUpperCase();
    if (!s) return SUGGESTIONS.slice(0, 6);
    return SUGGESTIONS.filter((t) => t.startsWith(s)).slice(0, 6);
  }, [symbol]);

  return (
    <LinearGradient colors={["#0f0f0f", "#171717", "#1f1b12"]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>₿ CoinBox ₿</Text>
          <Text style={styles.total}>{formatRUB(total)}</Text>

          <View style={styles.topButtons}>
            <TouchableOpacity style={[styles.smallBtn, autoRefresh ? styles.smallBtnOn : styles.smallBtnOff]}
              onPress={() => setAutoRefresh((v) => !v)}>
              <Text style={styles.smallBtnText}>{autoRefresh ? "Авто 5 мин: ВКЛ" : "Авто 5 мин: ВЫКЛ"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.smallBtn, styles.smallBtnBlue]} onPress={refreshLivePrices}>
              <Text style={styles.smallBtnText}>Обновить цены</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* FORM */}
        <View style={styles.form}>
          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Тикер</Text>
              <TextInput
                placeholder="BTC / ETH / SOL ..."
                placeholderTextColor="#9aa0a6"
                value={symbol}
                onChangeText={setSymbol}
                autoCapitalize="characters"
                style={styles.input}
              />
              {matched.length > 0 && (
                <View style={styles.suggestRow}>
                  {matched.map((t) => (
                    <TouchableOpacity key={t} onPress={() => setSymbol(t)} style={styles.suggestChip}>
                      <Text style={{ fontWeight: "700", color: "#E5E7EB" }}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.col}>
              <Text style={styles.label}>Кол-во</Text>
              <TextInput
                placeholder="напр. 1.5"
                placeholderTextColor="#9aa0a6"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                style={styles.input}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Цена (₽) — если без «Live»</Text>
              <TextInput
                placeholder="напр. 81000"
                placeholderTextColor="#9aa0a6"
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => {
              Alert.alert("Очистить портфель", "Удалить все записи?", [
                { text: "Отмена" },
                { text: "Удалить", style: "destructive", onPress: () => setItems([]) },
              ]);
            }}>
              <Text style={[styles.btnText, { color: "#111827" }]}>Очистить</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={addItem}>
              <Text style={styles.btnText}>Добавить монету</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* LIST */}
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          renderItem={({ item }) => <Row item={item} liveUSD={liveUSD} />}
          ListEmptyComponent={
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ color: "#cbd5e1" }}>Добавь первую монету, чтобы увидеть портфель</Text>
            </View>
          }
        />
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

/** ====== СТИЛИ ====== */
const styles = StyleSheet.create({
  header: {
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: "#f5d061",
  },
  total: { marginTop: 6, fontSize: 20, fontWeight: "700", color: "#F8FAFC" },

  topButtons: { marginTop: 10, flexDirection: "row", gap: 10 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  smallBtnOn: { borderColor: "rgba(34,197,94,0.5)", backgroundColor: "rgba(34,197,94,0.12)" },
  smallBtnOff: { borderColor: "rgba(239,68,68,0.5)", backgroundColor: "rgba(239,68,68,0.12)" },
  smallBtnBlue: { borderColor: "rgba(14,165,233,0.6)", backgroundColor: "rgba(14,165,233,0.18)" },
  smallBtnText: { color: "#E5E7EB", fontWeight: "700" },

  form: { paddingHorizontal: 16, paddingTop: 12 },
  inputRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  col: { flex: 1 },
  label: { marginBottom: 6, color: "#E5E7EB" },
  input: {
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.3)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#F1F5F9",
  },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  suggestChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.2)",
  },

  actionsRow: { flexDirection: "row", gap: 12, marginTop: 4, marginBottom: 8 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#0EA5E9" },
  btnGhost: { backgroundColor: "#E5E7EB" },
  btnText: { color: "#fff", fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.2)",
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  rowRight: { alignItems: "flex-end" },
  rowTitle: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  rowSub: { color: "#CBD5E1", marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: "700", color: "#F8FAFC" },
  coinIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "transparent" },
  coinIconFallback: { backgroundColor: "#9CA3AF", alignItems: "center", justifyContent: "center" },
});
