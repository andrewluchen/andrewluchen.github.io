// shitty code ported from python -> js

const _PRECISION = 0.001
const _HISTORICAL_PRICE_API = 'https://min-api.cryptocompare.com/data/pricehistorical'

function fix_ticker(ticker) {
  let fixes = {
    'IOTA': 'IOT',
  };
  if (ticker in fixes) {
    return fixes[ticker];
  }
  return ticker;
}

class TradeBt {
  constructor(...args) {
    if (args.length != 9) {
      throw 'TradeBt constructor';
    }
    this.date = args[0];
    this.source = args[1];
    this.action = args[2];
    this.symbol = args[3];
    this.volume = args[4];
    this.currency = args[5];
    this.price = args[6];
    this.fee = args[7];
    this.fee_currency = args[8];
    // fixes
    this.volume = parseFloat(this.volume);
    this.price = this.price ? parseFloat(this.price) : null;
    this.fee = this.fee ? parseFloat(this.fee) : 0.0;
    this.symbol = fix_ticker(this.symbol);
    this.currency = fix_ticker(this.currency);
    this.fee_currency = fix_ticker(this.fee_currency);
  }

  timestamp() {
    return new Date(this.date).getTime();
  }
}

class TradeCt {
  constructor(...args) {
    if (args.length != 11) {
      throw 'TradeCt constructor';
    }
    this.index00 = args[0];
    this.buy = args[1];
    this.buy_coin = args[2];
    this.sell = args[3];
    this.sell_coin = args[4];
    this.fee = args[5];
    this.fee_coin = args[6];
    this.exchange = args[7];
    this.index08 = args[8];
    this.index09 = args[9];
    this.date = args[10];
    // fixes
    this.buy = parseFloat(this.buy);
    this.sell = parseFloat(this.sell);
    this.fee = this.fee ? parseFloat(this.fee) : 0.0;
    this.buy_coin = fix_ticker(this.buy_coin);
    this.sell_coin = fix_ticker(this.sell_coin);
    this.fee_coin = fix_ticker(this.fee_coin);
  }

  toString() {
    return [this.buy, this.buy_coin, this.sell, this.sell_coin, this.fee, this.fee_coin, this.exchange, this.date].toString();
  }

  timestamp() {
    return new Date(this.date).getTime();
  }
}

class Holding {
  constructor(...args) {
    if (args.length != 4) {
      throw 'Holding constructor';
    }
    this.quantity = args[0];
    this.coin = args[1];
    this.usd_cost = args[2];
    this.date_acquired = args[3];
  }

  toString() {
    return [this.quantity, this.coin, this.usd_cost, this.date_acquired].toString();
  }
}

class Row {
  constructor(...args) {
    if (args.length != 8) {
      throw 'Row constructor';
    }
    this.description = args[0];
    this.date_acquired = args[1];
    this.date_sold = args[2];
    this.proceeds = args[3];
    this.cost_basis = args[4];
    this.adjustment_code = args[5];
    this.adjustment_amount = args[6];
    this.gain_loss = args[7];
  }

  toArray() {
    return [this.description, this.date_acquired, this.date_sold, this.proceeds, this.cost_basis, this.adjustment_code, this.adjustment_amount, this.gain_loss];
  }

  toString() {
    return this.toArray().toString();
  }
}

function sum_up(holdings) {
  coins = {}
  holdings.forEach(h => {
    if (!(h.coin in coins)) {
      coins[h.coin] = 0;
    }
    coins[h.coin] += h.quantity;
  });
  return coins;
}

function process_bt_trades(trades) {
  trades.sort(function (a, b) {
    return a.timestamp() - b.timestamp();
  });
  let price_cache = {};
  let holdings = [];
  let rows = [];
  trades.forEach(t => {
    [symbol_price, currency_price, fee_coin_price] = get_prices(price_cache, t.symbol, t.currency, t.fee_currency, t.timestamp())
    if (t.action === 'BUY') {
      if (t.currency === 'USD') {
        let cost = t.volume * (t.price ? t.price : symbol_price);
        holdings.push(new Holding(t.volume, t.symbol, cost, t.date));
      } else {
        let currency_volume = t.volume * (t.price ? t.price : (symbol_price / currency_price));
        let proceeds = currency_volume * currency_price;
        let [matched, holdings] = pop_holding(holdings, t.currency, currency_volume);
        record_proceeds(rows, matched, t.date, currency_volume, proceeds);
        holdings.push(new Holding(t.volume, t.symbol, proceeds, t.date));
      }
    } else if (t.action ==='SELL') {
      if (t.currency === 'USD') {
        let proceeds = t.volume * (t.price ? t.price : symbol_price);
        let [matched, holdings] = pop_holding(holdings, t.symbol, t.volume);
        record_proceeds(rows, matched, t.date, t.volume, proceeds);
      } else {
        let currency_volume = t.volume * (t.price ? t.price : (symbol_price / currency_price));
        let proceeds = t.volume * symbol_price;
        let [matched, holdings] = pop_holding(holdings, t.currency, t.volume);
        record_proceeds(rows, matched, t.date, currency_volume, proceeds);
        holdings.push(new Holding(currency_volume, t.symbol, proceeds, t.date));
      }
    } else {
      if (t.fee_currency === 'USD') {
        // usd fees maintain volume and increase cost basis
        row[-1].cost_basis += t.fee;
      } else {
        // coin fees decrease volume but maintain cost basis
        let unused = null;
        [_unused, holdings] = pop_holding(holdings, t.fee_currency, t.fee);
      }
    }
  });
  rows.forEach(r => {
    r.gain_loss = r.gain_loss.toFixed(2);
  });
  rows.filter(r => r.gain_loss !== 0);
  return rows;
}

function process_ct_trades(trades, onRecord) {
  trades.sort(function (a, b) {
    return a.timestamp() - b.timestamp();
  });
  let price_cache = {};
  let holdings = [];
  let rows = [];
  trades.forEach(t => {
    let [buy_coin_price, sell_coin_price, fee_coin_price] = get_prices(price_cache, t.buy_coin, t.sell_coin, t.fee_coin, t.timestamp());
    let buy = t.buy;
    let buy_price = t.buy * buy_coin_price;
    let proceeds = t.sell * sell_coin_price;
    if (t.fee_coin === t.buy_coin) {
      // percentage fee, subtract from purchases
      buy -= t.fee;
    } else {
      // add fee to cost basis
      buy_price += t.fee * fee_coin_price;
      // coin fee (aka BNB), subtract from holdings
      if (t.fee && t.fee_coin !== 'USD') {
        let _unused = null;
        [_unused, holdings] = pop_holding(holdings, t.fee_coin, t.fee);
      }
    }
    if (t.sell_coin === 'USD') {
      holdings.push(new Holding(buy, t.buy_coin, buy_price, t.date));
    } else if (t.buy_coin == 'USD') {
      let matched = [];
      [matched, holdings] = pop_holding(holdings, t.sell_coin, t.sell);
      record_proceeds(rows, matched, t.date, t.sell, proceeds, onRecord);
    } else {
      let matched = [];
      [matched, holdings] = pop_holding(holdings, t.sell_coin, t.sell);
      record_proceeds(rows, matched, t.date, t.sell, proceeds, onRecord);
      holdings.push(new Holding(buy, t.buy_coin, buy_price, t.date));
    }
  });
  rows.filter(r => r.gain_loss !== 0);
  return rows;
}

function get_prices(cache, buy, sell, fee, timestamp) {
  // only accurate to the day
  let day = parseInt(timestamp / 86400000).toString();
  let result = [];
  [buy, sell, fee].forEach(coin => {
    if (day + coin in cache) {
      result.push(cache[day + coin]);
    } else if (coin === 'USD') {
      result.push(1);
    } else if (coin) {
      let url = _HISTORICAL_PRICE_API + `?fsym=${coin}&tsyms=USD&ts=${timestamp/1000}`;
      let request = new XMLHttpRequest();
      request.open('GET', url, false);
      request.send(null);
      let price = JSON.parse(request.responseText)[coin]['USD']
      cache[day + coin] = price
      result.push(price);
    } else {
      result.push(0);
    }
  });
  return result;
}

function pop_holding(holdings, coin, quantity) {
  if (quantity < 0) {
    throw 'pop_holding: quantity < 0';
  }
  // too small to handle precision
  if (quantity < _PRECISION) {
    return [[], holdings];
  }
  for(let i = 0; i < holdings.length; i++) {
    let h = holdings[i];
    if (h.coin === coin) {
      if (Math.abs(h.quantity - quantity) < _PRECISION) {
        return [[holdings[i]], holdings.slice(0, i).concat(holdings.slice(i + 1))];
      } else if (h.quantity > quantity) {
        let new_quant = h.quantity - quantity;
        let new_cost = h.usd_cost * (1 - quantity/h.quantity);
        holdings[i] = new Holding(new_quant, h.coin, new_cost, h.date_acquired);
        h.usd_cost *= quantity/h.quantity;
        h.quantity = quantity;
        return [[h], holdings];
      } else {
        let match = holdings[i];
        let matches = [];
        holdings = holdings.slice(0, i).concat(holdings.slice(i + 1));
        [matches, holdings] = pop_holding(holdings, coin, quantity - h.quantity);
        return [[match].concat(matches), holdings];
      }
    }
  }
  throw 'pop_holding: could not pop';
}

function record_proceeds(rows, matches, date, quantity, proceeds, onRecord) {
  matches.forEach(m => {
    let fractional_proceeds = proceeds * m.quantity / quantity;
    rows.push(new Row(
      m.quantity + ' ' + m.coin,
      m.date_acquired,
      date,
      fractional_proceeds,
      m.usd_cost,
      '',
      '',
      (fractional_proceeds - m.usd_cost).toFixed(2),
    ));
    onRecord(rows[rows.length - 1]);
  });
}
