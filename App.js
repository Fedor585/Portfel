import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Ключ для локального хранилища
const STORE_KEY = "COINBOX_LOCAL_PORTFOLIO_v1";

// Небольшой справочник эмодзи и названий (для красоты; цены задаём вручную)
const COIN_META = {
  BTC: { name: "Bitcoin", emoji: "₿" },
  ETH: { name: "Ethereum", emoji: "◆" },
  USDT: { name: "Tether", emoji: "⊕" },
  TON: { name: "TON", emoji: "◎" },
  SOL: { name: "Solana", emoji: "◎" },
  BNB: { name: "BNB", emoji: "◉" },
};

function formatNum(n) {
  if (Number.isNaN(+n)) return "0";
  return Intl.NumberFormat("ru-RU", { maximumFractionDigits: 8 }).format(+n);
}
function formatFiat(n) {
  if (Number.isNaN(+n)) return "0 ₽";
  return Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(+n);
}

export default function App() {
  const [items, setItems] = useState([]); // {id, symbol, amount, price}
  const [isReady, setIsReady] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState(null); // редактируемый элемент или null

  // Поля формы
  const [symbol, setSymbol] = useState("");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");

  // Загружаем из памяти при старте
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (raw) setItems(JSON.parse(raw));
      } catch {}
      setIsReady(true);
    })();
  }, []);

  // Сохраняем при каждом изменении
  useEffect(() => {
    if (!isReady) return;
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, isReady]);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + it.amount * it.price, 0),
    [items]
  );

  function openAdd() {
    setEditing(null);
    setSymbol("");
    setAmount("");
    setPrice("");
    setModalVisible(true);
  }

  function openEdit(it) {
    setEditing(it);
    setSymbol(it.symbol);
    setAmount(String(it.amount));
    setPrice(String(it.price));
    setModalVisible(true);
  }

  function onSave() {
    const s = symbol.trim().toUpperCase();
    const a = parseFloat(String(amount).replace(",", "."));
    const p = parseFloat(String(price).replace(",", "."));

    if (!s) return Alert.alert("Укажи тикер", "Например: BTC");
    if (Number.isNaN(a) || a <= 0) return Alert.alert("Количество", "Неверное количество");
    if (Number.isNaN(p) || p < 0) return Alert.alert("Цена", "Неверная цена");

    if (editing) {
      setItems((prev) =>
        prev.map((it) => (it.id === editing.id ? { ...it, symbol: s, amount: a, price: p } : it))
      );
    } else {
      setItems((prev) => [
        ...prev,
        { id: Date.now().toString(), symbol: s, amount: a, price: p },
      ]);
    }
    setModalVisible(false);
  }

  function removeItem(id) {
    Alert.alert("Удалить позицию?", "Это действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => setItems((prev) => prev.filter((it) => it.id !== id)),
      },
    ]);
  }

  function clearAll() {
    Alert.alert("Очистить портфель?", "Будут удалены все позиции.", [
      { text: "Отмена", style: "cancel" },
      { text: "Очистить", style: "destructive", onPress: () => setItems([]) },
    ]);
  }

  const renderItem = ({ item }) => {
    const meta = COIN_META[item.symbol] || { name: "", emoji: "◦" };
    const value = item.amount * item.price;

    return (
      <Pressable style={styles.row} onLongPress={() => openEdit(item)}>
        <View style={styles.rowLeft}>
          <Text style={styles.coinEmoji}>{meta.emoji}</Text>
          <View>
            <Text style={styles.symbol}>{item.symbol}</Text>
            <Text style={styles.nameSmall}>{meta.name}</Text>
          </View>
        </View>

        <View style={styles.rowRight}>
          <Text style={styles.valueText}>{formatFiat(value)}</Text>
          <Text style={styles.amountText}>
            {formatNum(item.amount)} × {formatFiat(item.price)}
          </Text>
        </View>

        <Pressable onPress={() => removeItem(item.id)} style={styles.removeBtn}>
          <Text style={styles.removeTxt}>✕</Text>
        </Pressable>
      </Pressable>
    );
  };

  if (!isReady) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <Text style={{ textAlign: "center", marginTop: 40 }}>Загрузка…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>₿ CoinBox ₿</Text>
        <Text style={styles.total}>{formatFiat(total)}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Портфель пуст. Нажми «+», чтобы добавить первую монету.
          </Text>
        }
      />

      <View style={styles.bottomBar}>
        <Pressable style={[styles.barBtn, styles.clear]} onPress={clearAll}>
          <Text style={styles.barBtnText}>Очистить</Text>
        </Pressable>
        <Pressable style={[styles.barBtn, styles.add]} onPress={openAdd}>
          <Text style={styles.barBtnText}>Добавить монету</Text>
        </Pressable>
      </View>

      {/* Модалка добавления/редактирования */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing ? "Редактировать позицию" : "Новая позиция"}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>Тикер (например: BTC)</Text>
              <TextInput
                value={symbol}
                onChangeText={setSymbol}
                placeholder="BTC"
                autoCapitalize="characters"
                style={styles.input}
              />
            </View>

            <View style={styles.rowFields}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Количество</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.0000"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
              <View style={[styles.field, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.label}>Цена (₽) за 1</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={[styles.actionBtn, styles.cancelBtn]}
              >
                <Text style={styles.actionTxt}>Отмена</Text>
              </Pressable>
              <Pressable onPress={onSave} style={[styles.actionBtn, styles.saveBtn]}>
                <Text style={styles.actionTxt}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  total: { fontSize: 18, fontWeight: "600", textAlign: "center", marginTop: 4, color: "#111" },
  empty: { textAlign: "center", marginTop: 32, color: "#666" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fafafa",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  coinEmoji: { fontSize: 22, width: 30, marginRight: 8, textAlign: "center" },
  symbol: { fontSize: 16, fontWeight: "700" },
  nameSmall: { fontSize: 12, color: "#777" },
  rowRight: { alignItems: "flex-end" },
  valueText: { fontWeight: "700" },
  amountText: { color: "#666", marginTop: 2, fontSize: 12 },

  removeBtn: { marginLeft: 8, padding: 6 },
  removeTxt: { fontSize: 16, color: "#c33" },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  barBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  add: { backgroundColor: "#0ea5e9", marginLeft: 8 },
  clear: { backgroundColor: "#e5e7eb", marginRight: 8 },
  barBtnText: { color: "#111", fontWeight: "700" },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  field: { marginVertical: 6 },
  label: { fontSize: 12, color: "#666", marginBottom: 4 },
  input: {
    backgroundColor: "#f6f7f8",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  rowFields: { flexDirection: "row" },
  modalActions: { flexDirection: "row", marginTop: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: "#e5e7eb", marginRight: 8 },
  saveBtn: { backgroundColor: "#16a34a", marginLeft: 8 },
  actionTxt: { color: "#111", fontWeight: "700" },
});
