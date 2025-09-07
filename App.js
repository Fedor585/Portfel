// App.js (с градиентным фоном)
import React, { useMemo, useState, useEffect } from "react";
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

/** ====== МЕТАДАННЫЕ МОНЕТ + ИКОНКИ (пути без /icons/) ====== */
const COIN_META = {
  BTC: { name: "Bitcoin",   color: "#F7931A", icon: require("./assets/btc.png") },
  ETH: { name: "Ethereum",  color: "#6F42C1", icon: require("./assets/eth.png") },
  SOL: { name: "Solana",    color: "#14F195", icon: require("./assets/sol.png") },
  LINK:{ name: "Chainlink", color: "#2A5ADA", icon: require("./assets/link.png") },
  ARB: { name: "Arbitrum",  color: "#2D374B", icon: require("./assets/arb.png") },
  USDT:{ name: "Tether",    color: "#26A17B", icon: require("./assets/usdt.png") },
  TRX: { name: "TRON",      color: "#EB0029", icon: require("./assets/trx.png") },
  SUI: { name: "Sui",       color: "#3BA9FF", icon: require("./assets/sui.png") },
  DOT: { name: "Polkadot",  color: "#E6007A", icon: require("./assets/dot.png") },
};

const STORAGE_KEY = "@coinbox_portfolio_v1";

const formatRUB = (n) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 }).format(
    Number.isFinite(+n) ? +n : 0
  );

const SUGGESTIONS = Object.keys(COIN_META);

const Row = ({ item, onRemove }) => {
  const meta = COIN_META[item.symbol] || {};
  const icon = meta.icon;
  const lineTotal = item.amount * item.price;

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
          <Text style={styles.rowSub}>{meta.name || item.name || "Custom coin"}</Text>
        </View>
      </View>

      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{formatRUB(lineTotal)}</Text>
        <Text style={styles.rowSub}>
          {item.amount} × {formatRUB(item.price)}
        </Text>
      </View>

      <TouchableOpacity onPress={() => onRemove(item.id)} style={styles.removeBtn}>
        <Text style={{ color: "#ff8a8a", fontSize: 18 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

export default function App() {
  const [items, setItems] = useState([]);
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.amount) * Number(it.price), 0),
    [items]
  );

  const addItem = () => {
    const sym = symbol.trim().toUpperCase();
    const amt = Number(amount.replace(",", "."));
    const prc = Number(price.replace(",", "."));

    if (!sym) return Alert.alert("Монета", "Укажи тикер (например, BTC)");
    if (!Number.isFinite(amt) || amt <= 0) return Alert.alert("Количество", "Введи корректное количество");
    if (!Number.isFinite(prc) || prc < 0) return Alert.alert("Цена", "Введи корректную цену за монету");

    const meta = COIN_META[sym];
    setItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        symbol: sym,
        name: meta?.name || sym,
        amount: amt,
        price: prc,
      },
    ]);
    setSymbol("");
    setAmount("");
    setPrice("");
  };

  const removeItem = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  const clearAll = () => {
    Alert.alert("Очистить портфель", "Удалить все записи?", [
      { text: "Отмена" },
      { text: "Удалить", style: "destructive", onPress: () => setItems([]) },
    ]);
  };

  const matched = useMemo(() => {
    const s = symbol.trim().toUpperCase();
    if (!s) return SUGGESTIONS.slice(0, 6);
    return SUGGESTIONS.filter((t) => t.startsWith(s)).slice(0, 6);
  }, [symbol]);

  return (
    <LinearGradient
      colors={["#0f0f0f", "#171717", "#1f1b12"]} // тёмный → чуть светлее → тёплый (золотистый подтон)
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>₿ CoinBox ₿</Text>
          <Text style={styles.total}>{formatRUB(total)}</Text>
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
              <Text style={styles.label}>Цена (₽)</Text>
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
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={clearAll}>
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
          renderItem={({ item }) => <Row item={item} onRemove={removeItem} />}
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
    backgroundColor: "transparent",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
    color: "#f5d061", // золотистый
  },
  total: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: "700",
    color: "#F8FAFC",
  },

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
    backgroundColor: "rgba(255,255,255,0.06)", // полупрозрачная карточка, фон виден
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  rowRight: { alignItems: "flex-end" },
  rowTitle: { fontSize: 16, fontWeight: "800", color: "#F8FAFC" },
  rowSub: { color: "#CBD5E1", marginTop: 2 },
  rowValue: { fontSize: 16, fontWeight: "700", color: "#F8FAFC" },
  coinIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: "transparent" },
  coinIconFallback: { backgroundColor: "#9CA3AF", alignItems: "center", justifyContent: "center" },
  removeBtn: { paddingHorizontal: 6, paddingVertical: 6, marginLeft: 4 },
});
