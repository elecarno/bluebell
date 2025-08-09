<script>
  import { onMount, tick } from 'svelte'
  import fx from 'money'
  import short from 'short-uuid'
  import ColorPicker from 'svelte-awesome-color-picker';
  import Stats from './lib/Stats.svelte';
  import { folderPath } from './lib/stores/folder.js';
  import { get } from 'svelte/store';

  console.log("test")

  let selecting = false;

  let path = ''
  $: $folderPath !== null && (path = $folderPath)
  $: console.log('folderPath changed:', $folderPath)

  let transactions = {}
  let accounts = {}
  let payees = {}
  let rates = {}

  let currency_totals = {}
  let total_base = 0

  let show_add_acc = false
  let show_add_pay = false
  let show_edit_tr = false

  let show_stats = false

  // MONEY SETUP
  fx.base = "GBP"
  fx.rates = {
    "GBP": 1,
    "USD": 1,
    "EUR": 1,
    "JPY": 1
  }

  // MOUNT
  // Select Folder
  async function selectFolder() {
    selecting = true;

    try {
      const newPath = await window.electron.folder.select();
      console.log('Selected folder:', newPath);

      if (newPath) {
        const currentPath = get(folderPath);

        if (currentPath === newPath) {
          folderPath.set('');
          await tick();
        }

        folderPath.set(newPath);
        console.log('Set folderPath:', newPath);

        console.log('trigger load from select');
        await loadData();
      }
    } catch (err) {
      console.error('Error selecting folder:', err);
    } finally {
      selecting = false;
      console.log('set selecting to', selecting);
    }
  }

  async function loadData() {
    console.log("attempt to load data");
    const trRaw = await window.electron.json.read('transactions.json');
    const accRaw = await window.electron.json.read('accounts.json');
    const payRaw = await window.electron.json.read('payees.json');
    const ratesRaw = await window.electron.json.read('rates.json');

    transactions = JSON.parse(trRaw) || {};
    accounts = JSON.parse(accRaw) || {};
    payees = JSON.parse(payRaw) || {};
    rates = JSON.parse(ratesRaw) || {};

    console.log(transactions)

    if (
      Object.keys(transactions).length > 0 ||
      Object.keys(accounts).length > 0 ||
      Object.keys(payees).length > 0
    ) {
      console.log("processing data");

      fx.base = rates["base"]
      fx.rates = rates["rates"]

      console.log(fx.base)
      console.log(fx.rates)

      currency_totals = calc_totals();
      total_base = calc_total_base(currency_totals);

      console.log("data processed");
    } else {
      console.log("data empty");
    }
  }

  async function save_data() {
    const folder = get(folderPath);
    if (!folder) return;

    await window.electron.json.write('transactions.json', transactions);
    await window.electron.json.write('accounts.json', accounts);
    await window.electron.json.write('payees.json', payees);
  }

  onMount(async () => {
    console.log("running on mount");

    const existing = await window.electron.folder.get()
    folderPath.set(existing || '')

    const current = get(folderPath);
    if (current) {
      console.log("trigger load from mount (initial get)", current);
      loadData();
      selecting = false;
      console.log("set selecting to", selecting);
    }

    const unsub = folderPath.subscribe(fp => {
      if (fp && fp !== current) {
        console.log("trigger load from mount (subscribe)", fp);
        loadData();
        selecting = false;
        console.log("set selecting to", selecting);
      }
    });

    return () => unsub();
  });

  // ACC / PAY ADD
  let select_acc_name = ""
  let select_acc_col = "#4b4b4b"

  let select_pay_name = ""
  let select_pay_col = "#4b4b4b"

  function add_account() {
    let new_acc = {
      "name": select_acc_name,
      "colour": select_acc_col
    }

    accounts[Object.keys(accounts).length] = new_acc
    console.log(accounts)

    save_data()
  }

  function add_payee() {
    let new_pay = {
      "name": select_pay_name,
      "colour": select_pay_col
    }

    payees[Object.keys(payees).length] = new_pay
    console.log(payees)

    save_data()
  }

  // TRANSACTION ADD
  let select_account = "0"
  let select_payee = "0"
  let select_currency = fx.base
  let select_amount = 0
  let select_tags = ""
  let select_desc = ""
  let select_date = new Date().toISOString().split('T')[0];

  function add_transaction() {
    let uuid = short.generate()

    let parsed_tags = select_tags.split(',').map(tag => tag.trim());
    
    let new_tr = {
      "account": select_account,
      "payee": select_payee,
      "currency": select_currency,
      "amount": select_amount,
      "tags": parsed_tags,
      "description": select_desc,
      "timestamp": select_date
    }

    transactions[uuid] = new_tr
    console.log(transactions)

    update_left_panel()
    save_data()
  }

  // TRANSACTION EDIT
  let edit_id = "xxxxx"
  let edit_account = "0"
  let edit_payee = "0"
  let edit_currency = fx.base
  let edit_amount = 0
  let edit_tags = ""
  let edit_desc = ""
  let edit_date = new Date().toISOString().split('T')[0];

  function edit_tr_open(tr) {
    let tr_data = transactions[tr]

    edit_id = tr
    edit_account = tr_data.account
    edit_payee = tr_data.payee
    edit_currency = tr_data.currency
    edit_amount = tr_data.amount
    edit_tags = tr_data.tags.join(', ');
    edit_desc = tr_data.description
    edit_date = tr_data.timestamp

    show_edit_tr = true
  }

  function edit_tr_submit(tr) {
    let parsed_tags = edit_tags.split(',').map(tag => tag.trim());

    let updated_tr = {
      "account": edit_account,
      "payee": edit_payee,
      "currency": edit_currency,
      "amount": edit_amount,
      "tags": parsed_tags,
      "description": edit_desc,
      "timestamp": edit_date
    }

    transactions[tr] = updated_tr
    console.log(transactions)
    update_left_panel()
    save_data()
  }

  function update_left_panel(){
    accounts = accounts
    payees = payees
    currency_totals = calc_totals()
    total_base = calc_total_base(currency_totals)
  }

  // DATA HANDLING
  function calc_totals() {
    let totals = {}
    for (const tr in transactions) {
      let currency = transactions[tr].currency
      let amount = transactions[tr].amount
      if (currency in totals){
        totals[currency] += amount
      } else {
        totals[currency] = amount
      }
    }
    
    for (const cur in totals) {
      totals[cur] = Math.round(totals[cur] * 100) / 100
    }
    return totals
  }

  function calc_total_base(cur_totals){
    let total_base_cur = 0
    for (const cur in cur_totals){
      let conv = fx.convert(cur_totals[cur], {from: cur, to: fx.base});
      total_base_cur += conv
    }
    total_base_cur = Math.round(total_base_cur * 100) / 100
    return total_base_cur
  }

  function calc_acc_totals(acc){
    let acc_totals = {}
    for (const tr in transactions){
      if (transactions[tr].account == acc){
        let currency = transactions[tr].currency
        let amount = transactions[tr].amount
        if (currency in acc_totals){
          acc_totals[currency] += amount
        } else {
          acc_totals[currency] = amount
        }
      }
    }

    for (const cur in acc_totals) {
      acc_totals[cur] = Math.round(acc_totals[cur] * 100) / 100
    }
    return acc_totals
  }

  function calc_pay_totals(pay){
    let pay_totals = {
      "inc": 0,
      "exp": 0
    }
    for (const tr in transactions){
      if (transactions[tr].payee == pay){ // && !transactions[tr].tags.includes("transfer")
        let amount = transactions[tr].amount
        let currency = transactions[tr].currency
        if (amount >= 0) {
          pay_totals["inc"] += fx.convert(amount, {from: currency, to: fx.base});
        } else {
          pay_totals["exp"] += fx.convert(amount, {from: currency, to: fx.base});
        }
      }
    }

    pay_totals["inc"] = Math.round(pay_totals["inc"] * 100) / 100
    pay_totals["exp"] = Math.round(pay_totals["exp"] * 100) / 100
    return pay_totals
  }

  // DATA GETTING
  function get_acc_name(acc_id){
    if (acc_id in accounts){
      return accounts[acc_id].name
    } else {
      return "Default"
    }
  }

  function get_pay_name(pay_id){
    if (pay_id in payees){
      return payees[pay_id].name
    } else {
      return "N/A"
    }
  }
</script>

<main>
  {#if !show_stats}
    <div>
      <div class="con-overview">
        <div class="con-left">
            <!-- BALANCES -->
          <div class="pan-balances">
            <!-- Currencies -->
              <h2>Total ({fx.base}): {total_base}</h2>
              <div class="con-totals">
                {#each Object.keys(currency_totals) as cur}
                  <span style="width: 100%;">{cur}: {currency_totals[cur].toFixed(2)}</span><br>
                {/each}
              </div>
              <div style="width: 100%; display: flex; flex-direction: row; gap: 6px">
                <button class="btn-page" on:click={selectFolder}>Set / Change Data Folder</button>
                <button class="btn-page" on:click={() => {show_stats = true}}>Statistics</button>
              </div>
              <span style="font-family: monospace;">{$folderPath}</span>
          </div>
          <!-- Accounts & Payees -->
          <div class="pan-acc-pay">
            <!-- Accounts -->
            <div class="con-accounts" data-mdb-perfect-scrollbar='true'>
              <h3>Accounts</h3>
              <button on:click={() => {show_add_acc = true}}>Add</button>
              <hr>
              <div class="con-scrollbox">
                {#each Object.keys(accounts) as acc}
                  <button class="btn-account" 
                          on:click={() => {select_account = acc; edit_account = acc}}
                          style="background-color: {accounts[acc].colour}">
                    <h3 style="margin: 0;">{accounts[acc].name}</h3>
                    <span>Total (GBP): {calc_total_base(calc_acc_totals(acc)).toFixed(2)}</span>
                    <hr>
                    {#each Object.keys(calc_acc_totals(acc)) as cur}
                      <span>{cur}: {calc_acc_totals(acc)[cur].toFixed(2)}</span><br>
                    {/each}
                  </button>
                {/each}
              </div>
            </div>

            <!-- Payees -->
            <div class="con-payees" data-mdb-perfect-scrollbar='true'>
              <h3>Payees</h3>
              <button on:click={() => {show_add_pay = true}}>Add</button>
              <hr>
              <div class="con-scrollbox">
                {#each Object.keys(payees) as pay}
                  <button class="btn-payee" 
                          on:click={() => {select_payee = pay; edit_payee = pay}}
                          style="background-color: {payees[pay].colour}">
                    <p style="margin-top: 0; margin-bottom: 4px;"><b>{payees[pay].name}</b></p>
                    <span>Sen: {Math.abs(calc_pay_totals(pay)["exp"]).toFixed(2)}</span><br>
                    <span>Rec: {calc_pay_totals(pay)["inc"].toFixed(2)}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </div>

        <!-- TRANSACTIONS -->
        <div class="pan-transactions">
          <h3>Transactions</h3>
          <div class="con-tr-add">
            <span>Account: <b>{get_acc_name(select_account)}</b></span>
            <span>Payee: <b>{get_pay_name(select_payee)}</b></span>
            <br>
            <div style="display: flex; flex-direction: row; gap: 12px; margin-top: 6px">
              <span>Currency: </span><input type="text" bind:value={select_currency}>
              <span style="margin-left: 8px">Amount: </span><input type="number" bind:value={select_amount}>
              <span style="margin-left: 8px">Tags: </span><input type="text" bind:value={select_tags}>
              <span style="margin-left: 8px">Date: </span><input type="text" bind:value={select_date}>
              <button style="width: 100px;" on:click={() => add_transaction()}>Add</button>
            </div>
            <!-- <br> -->
            <!-- <span>Description: </span><textarea>{select_desc}</textarea> -->
          </div>
          <hr>

          <div class="btn-tr" style="color: rgba(255, 255, 255, 0.87)">
            <span class="tr-entry" style="width: 75px;"></span>
            <span class="tr-entry" style="width: 200px;">Amount</span>
            <span class="tr-entry">Account</span>
            <span class="tr-entry">Payee</span>
            <span class="tr-entry" style="width: 60%">Tags</span>
            <span class="tr-entry" style="width: 200px;">Date</span>
            <span class="tr-entry" style="width: 100px;">ID</span>
          </div>
          <div class="con-tr-list" data-mdb-perfect-scrollbar='true'>
            {#each Object.keys(transactions).reverse() as key}
              <button 
                class="btn-tr"
                class:tr-red={transactions[key].amount < 0}
                class:tr-green={transactions[key].amount >= 0}
                on:click={() => {edit_tr_open(key)}}
                >
                <span class="tr-entry" style="width: 75px;">{transactions[key].currency}</span>
                <span class="tr-entry" style="width: 200px;">{Math.abs(transactions[key].amount).toFixed(2)}</span>
                <span class="tr-entry">{accounts[transactions[key].account].name}</span>
                <span class="tr-entry">{payees[transactions[key].payee].name}</span>
                <span class="tr-entry" style="font-size: 12px; width: 60%">{transactions[key].tags.join(', ')}</span>
                <span class="tr-entry tr-mono" style="width: 150px;">{transactions[key].timestamp}</span>
                <span class="tr-entry tr-mono" style="text-align: right; width: 150px;">{key.slice(0, 5)}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- DIALOGS -->
        {#if show_add_acc || show_add_pay}
          <div class="bg-darken">
            <!-- Account -->
            {#if show_add_acc}
              <div class="pan-dialog">
                <h2>Add Account</h2>
                <span>Name </span><input type="text" bind:value={select_acc_name}>
                <!-- <span>Colour </span><input type="text"> -->
                <ColorPicker bind:hex={select_acc_col}/>
                <hr>
                <button style="margin-top: 12px; margin-bottom: 6px" on:click={() => {add_account()}}>Add</button>
                <button style="margin-bottom: 24px;" on:click={() => {show_add_acc = false}}>Close</button>
              </div>
            {/if}
            <!-- Payee -->
            {#if show_add_pay}
            <div class="pan-dialog">
              <h2>Add Payee</h2>
              <span>Name </span><input type="text" bind:value={select_pay_name}>
              <!-- <span>Colour </span><input type="text"> -->
              <ColorPicker bind:hex={select_pay_col}/>
              <hr>
              <button style="margin-top: 12px; margin-bottom: 6px" on:click={() => {add_payee()}}>Add</button>
              <button style="margin-bottom: 24px;" on:click={() => {show_add_pay = false}}>Close</button>
            </div>
            {/if}
          </div>
        {/if}

        <!-- Transaction -->
        {#if show_edit_tr}
        <div class="bg-darken" style="background-color: rgba(0, 0, 0, 0); pointer-events: none;">
          <div class="pan-dialog" style="pointer-events: all;">
            <h2 style="margin-bottom: 4px;">Edit Transaction</h2>
            <span>ID: {edit_id}</span>
            <hr>
            <span>Account: <b>{get_acc_name(edit_account)}</b></span>
            <span>Payee: <b>{get_pay_name(edit_payee)}</b></span>
            <span>Currency: </span><input type="text" bind:value={edit_currency}>
            <span>Amount: </span><input type="number" bind:value={edit_amount}>
            <span>Tags: </span><input type="text" bind:value={edit_tags}>
            <span>Date: </span><input type="text" bind:value={edit_date}>
            <hr>
            <button style="margin-top: 12px; margin-bottom: 6px" on:click={() => {edit_tr_submit(edit_id)}}>Submit</button>
            <button style="margin-bottom: 24px;" on:click={() => {show_edit_tr = false}}>Cancel</button>
          </div>
        </div>
        {/if}
      </div>
    </div>
  {:else}
      <div class="con-stats">
        <Stats on:close={() => {show_stats = false}} 
          transactions={transactions}
          accounts={accounts}
          payees={payees}
          />
      </div>
  {/if}
</main>

<style>
.con-stats,
.con-overview {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: stretch;
  width: 100%;
  height: 100vh;
  gap: 8px;
}

.btn-page {
  width: 100%;
  margin-top: 12px;
  margin-bottom: 4px;
  height: 24px;
}

.bg-darken {
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}

.pan-dialog {
  background-color: #333333;
  width: 20%;
  border-radius: 8px;
  border: 2px #222222 solid;
  display: flex;
  flex-direction: column;
  justify-content: stretch;
  align-items: stretch;
  padding-left: 24px;
  padding-right: 24px;
}

.pan-dialog button {
  height: 24px;
}

.pan-dialog span {
  margin-top: 8px;
  margin-bottom: 4px;
}

.con-totals {
  display: flex;
  flex-direction: row;
  justify-content: stretch;
}

.con-left {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 35%;
}

.pan-balances {
  background-color: #333333;
  padding: 8px;
  padding-left: 24px;
  padding-right: 8px;
  box-sizing: border-box;
  flex: 0 0 auto;

  border-bottom-right-radius: 8px;
}

.pan-transactions {
  background-color: #333333;
  padding: 8px;
  padding-right: 24px;
  width: 65%;
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.con-accounts,
.con-payees {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.con-tr-list {
  /* flex-grow: 1; */
  overflow-y: scroll;
  border-radius: 8px;
}

.con-scrollbox {
  width: 100%;
  flex-grow: 1;
  overflow-y: auto;
}

.btn-account,
.btn-payee {
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 4px;
  width: 100%;
  text-align: left;
}

.pan-acc-pay {
  display: flex;
  flex-direction: row;
  background-color: #333333;
  padding: 8px;
  padding-left: 16px;
  gap: 12px;
  margin-top: 8px;
  height: 100%;
  overflow: hidden;

  border-top-right-radius: 8px;
}

.btn-tr {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: stretch;
  color: #111;
  height: 28px;
  padding: 5px;
  padding-left: 15px;
  padding-right: 15px;
  gap: 4px;
  margin-bottom: 2px;
  border-radius: 0px;
  width: 100%;
  text-align: left;
  font-size: 14px;
}

.tr-entry {
  width: 30%;
}

.tr-mono {
  font-family: monospace;
}

.tr-green {
  background-color: #7deb6e;
}
.tr-green:hover {
  background-color: #6cc95f;
}

.tr-red {
  background-color: #e06d69;
}
.tr-red:hover {
  background-color: #bd5c59;
}
</style>
