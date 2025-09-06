import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  SafeAreaView,
  StatusBar,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Включаем анимации списков на Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** ====== МЕТАДАННЫЕ МОНЕТ + ИКОНКИ (ставим после импортов) ====== */
const COIN_META = {
  BTC: { name: "Bitcoin",  color: "#F7931A", icon: require("./assets/icons/btc.png") },
  ETH: { name: "Ethereum", color: "#6F42C1", icon: require("./assets/icons/eth.png") },
  SOL: { name: "Solana",   color: "#14F195", icon: require("./assets/icons/sol.png") },
  LINK:{ name: "Chainlink",color: "#2A5ADA", icon: require("./assets/icons/link.png") },
  ARB: { name: "Arbitrum", color: "#28A0F0", icon: require("./assets/icons/arb.png") },
  USDT:{ name: "Tether",   color: "#26A17B", icon: require("./assets/icons/usdt.png") },
  XRP: { name: "XRP",      color: "#121212", icon: require("./assets/icons/xrp.png") },
  TRX: { name: "TRON",     color: "#FF060A", icon: require("./assets/icons/trx.png") },
  SUI: { name: "Sui",      color: "#4DA3FF", icon: require("./assets/icons/sui.png") },
  DOT: { name: "Polkadot", color: "#E6007A", icon: require("./assets/icons/dot.png") },
};

const SUPPORTED = Object.keys(COIN_META); // для быстрых кнопок
const STORAGE_KEY = "@coinbox_portfolio_v1";
const STORAGE_CURRENCY = "@coinbox_currency_v1";

// Фикс-курсы (без бэкенда), можно менять в одном месте
const USD_TO_RUB = 81;
const PRICES_USD = {
  BTC: 65000,
  ETH: 3200,
  USDT: 1,
  BNB: 580, // если вдруг добавим
  SOL: 145,
  LINK: 14,
  ARB: 0.9,
  XRP: 0.52,
  TRX: 0.12,
  SUI: 1.2,
  DOT: 6.5,
};

// Рендер иконки монеты с фолбэком
function CoinIcon({ symbol, size = 28 }) {
  const meta = COIN_META[symbol];
  if (meta?.icon) {
    return (
      <Image
        source={meta.icon}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="contain"
      />
    );
  }
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: "#E0E0E0", alignItems: "center", justifyContent: "center",
      }}
    >
      <Text style={{ fontWeight: "700" }}>{symbol?.[0] || "?"}</Text>
    </View>
  );
}

// форматирование
function fmtMoney(n, cur) {
  const f = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: cur === "USD" ? "USD" : "RUB",
    maximumFractionDigits: 2,
  });
  return f.format(n).replace("\u00A0", " ");
}

export default function App() {
  const [portfolio, setPortfolio] = useState([]); // [{symbol, amount}]
  const [currency, setCurrency] = useState("RUB");
  const [isModal, setIsModal] = useState(false);
  const [symbol, setSymbol] = useState("BTC");
  const [amount, setAmount] = useState("");

  // загрузка
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) setPortfolio(JSON.parse(saved));
        const cur = await AsyncStorage.getItem(STORAGE_CURRENCY);
        if (cur === "USD" || cur === "RUB") setCurrency(cur);
      } catch {}
    })();
  }, []);

  // сохранение
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)).catch(() => {});
  }, [portfolio]);

  const totals = useMemo(() => {
    const items = portfolio.map((it) => {
      const usd = PRICES_USD[it.symbol] ?? 0;
      const p = currency === "RUB" ? usd * USD_TO_RUB : usd;
      const v = it.amount * p;
      return { ...it, price: p, value: v };
    });
    const sum = items.reduce((a, x) => a + x.value, 0);
    return { items, sum };
  }, [portfolio, currency]);

  const addCoin = () => {
    const a = parseFloat(String(amount).replace(",", "."));
    if (!a || a <= 0) {
      Alert.alert("Количество", "Введите положительное число.");
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPortfolio((prev) => {
      const ex = prev.find((x) => x.symbol === symbol);
      if (ex) return prev.map((x) => (x.symbol === symbol ? { ...x, amount: x.amount + a } : x));
      return [...prev, { symbol, amount: a }];
    });
    setAmount("");
    setIsModal(false);
  };

  const removeCoin = (sym) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPortfolio((prev) => prev.filter((x) => x.symbol !== sym));
  };

  const clearAll = () => {
    Alert.alert("Очистить портфель?", "Все монеты будут удалены.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Очистить",
        style: "destructive",
        onPress: () => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setPortfolio([]);
        },
      },
    ]);
  };

  const refreshPrices = () => {
    // просто триггерим пересчёт по константам
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPortfolio((prev) => [...prev]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>₿ CoinBox ₿</Text>

      <View style={styles.balanceRow}>
        <Text style={styles.balanceValue}>
          {fmtMoney(totals.sum, currency)}
        </Text>
        <TouchableOpacity
          style={styles.currencySwitch}
          onPress={() => {
            const next = currency === "RUB" ? "USD" : "RUB";
            setCurrency(next);
            AsyncStorage.setItem(STORAGE_CURRENCY, next).catch(() => {});
          }}
        >
          <Text style={styles.currencySwitchText}>{currency === "RUB" ? "₽" : "$"}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={totals.items}
        keyExtractor={(it) => it.symbol}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>Добавь монету — и портфель оживёт ✨</Text>}
        renderItem={({ item }) => {
          const meta = COIN_META[item.symbol] || { color: "#999", name: item.symbol };
          return (
            <View style={[styles.card, { borderLeftColor: meta.color }]}>
              <View style={styles.cardLeft}>
                <CoinIcon symbol={item.symbol} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.cardSymbol}>{item.symbol}</Text>
                  <Text style={styles.cardName}>{meta.name}</Text>
                </View>
              </View>

              <View style={styles.cardRight}>
                <Text style={styles.cardValue}>{fmtMoney(item.value, currency)}</Text>
                <Text style={styles.cardSub}>
                  {item.amount} × {fmtMoney(item.price, currency)}
                </Text>
              </View>

              <TouchableOpacity style={styles.del} onPress={() => removeCoin(item.symbol)}>
                <Text style={{ color: "#C62828", fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <View style={styles.bottomBar}>
        <TouchableOpacity style={[styles.btn, styles.btnGray]} onPress={clearAll}>
          <Text style={styles.btnTextDark}>Очистить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnGray]} onPress={refreshPrices}>
          <Text style={styles.btnTextDark}>Обновить цены</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnBlue]} onPress={() => setIsModal(true)}>
          <Text style={styles.btnTextLight}>Добавить</Text>
        </TouchableOpacity>
      </View>

      {/* Модалка добавления */}
      <Modal animationType="slide" visible={isModal} transparent onRequestClose={() => setIsModal(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Добавление монеты</Text>

            <Text style={styles.label}>Монета</Text>
            <View style={styles.coinRow}>
              {SUPPORTED.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSymbol(s)}
                  style={[
                    styles.coinChip,
                    symbol === s && { backgroundColor: (COIN_META[s]?.color) || "#000" },
                  ]}
                >
                  <Text style={[styles.coinChipText, symbol === s && { color: "#fff" }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Количество</Text>
            <TextInput
              placeholder="Например: 1000"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              style={styles.input}
            />

            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={[styles.btn, styles.btnGray, { flex: 1 }]} onPress={() => setIsModal(false)}>
                <Text style={styles.btnTextDark}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnBlue, { flex: 1 }]} onPress={addCoin}>
                <Text style={styles.btnTextLight}>Добавить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ====== СТИЛИ ====== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  title: {
    textAlign: "center",
    marginTop: 16,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: "#9C6F1F", // золотистый заголовок
  },
  balanceRow: {
    marginTop: 6,
    paddingHorizontal: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  balanceValue: { fontSize: 22, fontWeight: "700" },
  currencySwitch: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#F1F1F1",
  },
  currencySwitchText: { fontSize: 16, fontWeight: "700" },

  empty: { textAlign: "center", marginTop: 40, color: "#777" },

  card: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 5,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  cardSymbol: { fontSize: 16, fontWeight: "700" },
  cardName: { color: "#777" },
  cardRight: { alignItems: "flex-end" },
  cardValue: { fontSize: 16, fontWeight: "700" },
  cardSub: { color: "#777", marginTop: 2, fontSize: 12 },
  del: { padding: 6, marginLeft: 8 },

  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnBlue: { backgroundColor: "#0EA5E9" },
  btnGray: { backgroundColor: "#EDEDED" },
  btnTextLight: { color: "#fff", fontWeight: "700" },
  btnTextDark: { color: "#222", fontWeight: "700" },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  label: { marginTop: 8, marginBottom: 6, color: "#555", fontWeight: "600" },
  coinRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  coinChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F1F1",
  },
  coinChipText: { fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E2E2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
