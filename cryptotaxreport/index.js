const _BTC_ADDRESS = '1GdaNVovRrTaZzpWrkUH6vyfB4rX3Yztpk';
const _ETH_ADDRESS = '0xf34743BB82b1579f663c3a4F37dfbFCEA387715E';
const _LTC_ADDRESS = 'LVv67tr99pYPjgJBfxYjYdmSQgP2MWiqc6';
const _SRC_LINK = 'https://github.com/andrewluchen/cryptotaxreport/';

const _HEADERS = [
  'Description',
  'Date Acquired',
  'Date Sold',
  'Proceeds',
  'Cost Basis',
  'Adjustment Code',
  'Adjustment Amount',
  'Gain/Loss',
];

class App extends React.Component {

  constructor() {
    super();
    this.renderRow = this.renderRow.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onClick = this.onClick.bind(this);
    this.streamOutput = this.streamOutput.bind(this);
    this.processData = this.processData.bind(this);
    this.state = {
      file: null,
      rows: [],
    };
  }

  renderRow(row) {
    let tds = [
      row.description,
      row.date_acquired,
      row.date_sold,
      row.proceeds,
      row.cost_basis,
      row.adjustment_code,
      row.adjustment_amount,
      row.gain_loss,
    ];
    return (
      <tr>
        {tds.map(content => <td>{content}</td>)}
      </tr>
    );
  }

  render() {
    let renderedRows = [];
    this.state.rows.forEach(row => {
      renderedRows.push(this.renderRow(row));
    });
    return (
      <div className="App">
        <input type="file" onChange={this.onChange} />
        <button onClick={this.onClick}>Process CSV</button>
        <br/><br/>
        <a href="example.csv">Example CSV with fake data to upload</a><br/>
        <br/><br/>
        <table border="1"><tbody>
          <tr>
            {_HEADERS.map(h => <th>{h}</th>)}
          </tr>
          {renderedRows}
        </tbody></table>
        <br/><br/><br/>
        <div style={{'fontFamily': 'monospace'}}>
          <div>Secret Sauce: {_SRC_LINK}</div>
          <div>Please contribute your improvements back to the community.</div>
          <br/>
          <div>If you found this helpful, add a tip:</div><br/>
          <div>BTC: {_BTC_ADDRESS}</div>
          <div>ETH: {_ETH_ADDRESS}</div>
          <div>LTC: {_LTC_ADDRESS}</div>
        </div>
      </div>
    );
  }

  onChange(e) {
    this.setState({
      file: e.target.files[0],
      rows: [],
    });
  }

  onClick() {
    let reader = new FileReader();
    reader.onload = function() {
      let data = Papa.parse(reader.result)['data'];
      this.processData(data);
    }.bind(this);
    reader.readAsText(this.state.file);
  }

  processData(data) {
    data = data.slice(1);
    data = data.filter(d => d.length > 1);
    let trades = data.map(row => new TradeCt(...row));
    let rows = process_ct_trades(trades, this.streamOutput);
    let csv = Papa.unparse({
      fields: _HEADERS,
      data: rows.map(r => r.toArray()),
    });
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '8949.csv');
  }

  streamOutput(row) {
    this.setState({
      'rows': [...this.state.rows, row],
    });
  }
}

ReactDOM.render(<App/>, document.getElementById('root'));
