import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";

// ====== ФОРМАТИРОВАНИЕ ======
function fmtUSD(v) {
  return `$${v.toFixed(2)}`;
}
function fmtRUB(v) {
  return `${v.toFixed(2)} ₽`;
}

// ====== МЕТАДАННЫЕ МОНЕТ ======
const COIN_META = {
  BTC: { name: "Bitcoin", color: "#F7931A" },
  ETH: { name: "Ethereum", color: "#6F42C1" },
  SOL: { name: "Solana", color: "#14F195" },
  LINK: { name: "Chainlink", color: "#2A5ADA" },
};

export default function App() {
  const [prices, setPrices] = useState({});
  const [loadingMarket, setLoadingMarket] = useState(false);

  // USD/RUB курс
  const [usdRub, setUsdRub] = useState(null);
  const [loadingFx, setLoadingFx] = useState(false);

  // Загружаем цены монет (CoinGecko)
  async function fetchPrices() {
    try {
      setLoadingMarket(true);
      const resp = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,chainlink&vs_currencies=usd"
      );
      const data = await resp.json();
      setPrices({
        BTC: data.bitcoin.usd,
        ETH: data.ethereum.usd,
        SOL: data.solana.usd,
        LINK: data.chainlink.usd,
      });
    } catch (e) {
      console.warn("Ошибка загрузки цен:", e);
    } finally {
      setLoadingMarket(false);
    }
  }

  // Загружаем курс USD/RUB
  async function fetchUsdRub() {
    try {
      setLoadingFx(true);
      const resp = await fetch(
        "https://api.exchangerate.host/latest?base=USD&symbols=RUB"
      );
      const data = await resp.json();
      setUsdRub(data?.rates?.RUB ?? null);
    } catch (e) {
      console.warn("USD/RUB fetch error:", e);
    } finally {
      setLoadingFx(false);
    }
  }

  // Первичная загрузка
  useEffect(() => {
    fetchPrices();
    fetchUsdRub();
  }, []);

  // Обновление каждые 5 минут
  useEffect(() => {
    const timer = setInterval(() => {
      fetchPrices();
      fetchUsdRub();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>💰 CoinBox</Text>

      {/* USD/RUB курс */}
      <View style={styles.badgeRow}>
        <View style={styles.usdBadge}>
          <Text style={styles.usdBadgeTitle}>USD/RUB</Text>
          <Text style={styles.usdBadgeValue}>
            {loadingFx ? "…" : usdRub ? usdRub.toFixed(2) : "—"}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.smallBtn, styles.smallBtnBlue]}
          onPress={() => {
            fetchPrices();
            fetchUsdRub();
          }}
        >
          <Text style={styles.smallBtnText}>
            {loadingMarket ? "Обновляю…" : "Обновить"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Список монет */}
      <ScrollView style={{ marginTop: 20 }}>
        {Object.keys(COIN_META).map((sym) => (
          <View key={sym} style={[styles.coinCard, { borderColor: COIN_META[sym].color }]}>
            <Text style={[styles.coinSymbol, { color: COIN_META[sym].color }]}>{sym}</Text>
            <Text style={styles.coinName}>{COIN_META[sym].name}</Text>
            {prices[sym] ? (
              <Text style={styles.coinPrice}>{fmtUSD(prices[sym])}</Text>
            ) : (
              <ActivityIndicator size="small" color="#999" />
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ====== СТИЛИ ======
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    color: "#FFD700",
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
    justifyContent: "space-between",
  },
  usdBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f5132",
    borderColor: "#198754",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    gap: 8,
  },
  usdBadgeTitle: {
    color: "#A6FFC7",
    fontWeight: "700",
  },
  usdBadgeValue: {
    color: "white",
    fontWeight: "700",
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  smallBtnBlue: {
    backgroundColor: "#1D4ED8",
  },
  smallBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 12,
  },
  coinCard: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#1E293B",
  },
  coinSymbol: {
    fontSize: 20,
    fontWeight: "bold",
  },
  coinName: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  coinPrice: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
});
