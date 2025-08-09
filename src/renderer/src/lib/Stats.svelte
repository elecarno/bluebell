<script>
    import { onMount, createEventDispatcher } from 'svelte'
    import fx from 'money'
    import ChartDataLabels from 'chartjs-plugin-datalabels';
    import {
        Chart as ChartJS,
        ArcElement,
        Tooltip,
        Legend,
    } from 'chart.js';
    ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);
    import Chart from './Chart.svelte';

    export let transactions = {}
    // svelte-ignore export_let_unused
    export let accounts = {}
    // svelte-ignore export_let_unused
    export let payees = {}

    let bar_mode = 'stacked';
    $: bar_data = generate_bar_data(filtered_transactions, bar_mode);
    $: bar_options = get_bar_options(bar_mode);


    let pie_mode = 'split_by_tag';
    $: pie_data = generate_pie_data(filtered_transactions, pie_mode);
    $: pie_options = get_pie_options();

    $: balance_data = generate_balance_data(transactions, filter_date_start, filter_date_end);
    $: balance_options = get_balance_options();

    $: totals = calculate_totals(filtered_transactions);

    fx.base = "GBP"
    fx.rates = {
        "USD": 1.3281,
        "EUR": 1.1460,
        "JPY": 196.1655
    }
    
    const dispatch = createEventDispatcher();
    function close_stats() {
        dispatch("close");
    }

    // FILTERS
    let filtered_transactions = {}

    const today = new Date();
    const past30 = new Date();
    past30.setDate(today.getDate() - 30);

    let filter_date_start = formatDate(past30);
    let filter_date_end = formatDate(today);

    let filter_tags = "-transfer, -convert"

    function setDateRange(daysAgo) {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - daysAgo);

        filter_date_start = formatDate(start);
        filter_date_end = formatDate(end);
    }

    function update_from_filters() {
        const include_tags = [];
        const exclude_tags = [];

        if (filter_tags !== "all") {
            const parsed_tags = filter_tags.split(',').map(tag => tag.trim());

            for (const tag of parsed_tags) {
                if (tag.startsWith('-')) {
                    exclude_tags.push(tag.slice(1));
                } else {
                    include_tags.push(tag);
                }
            }
        }

        // Normalize date filters
        const startDate = filter_date_start ? new Date(filter_date_start) : null;
        const endDate = filter_date_end ? new Date(filter_date_end) : null;

        const result = {};

        for (const trId in transactions) {
            const tr = transactions[trId];
            const tags = tr.tags || [];
            const trDate = new Date(tr.timestamp);

            // --- Filter by date ---
            if (startDate && trDate < startDate) continue;
            if (endDate && trDate > endDate) continue;

            // --- Exclude tag filter ---
            const hasExcludedTag = exclude_tags.some(tag => tags.includes(tag));
            if (hasExcludedTag) continue;

            // --- Include tag filter ---
            const hasIncludedTag =
                include_tags.length === 0 || include_tags.some(tag => tags.includes(tag));

            if (hasIncludedTag) {
                result[trId] = tr;
            }
        }

        filtered_transactions = result;

        bar_data = generate_bar_data(filtered_transactions, bar_mode);
        bar_options = get_bar_options(bar_mode);
    }

    function calculate_totals(transactions) {
        let income = 0;
        let expenses = 0;

        for (const id in transactions) {
            const tr = transactions[id];
            const amount = tr.amount;

            if (amount > 0) {
                income += amount;
            } else {
                expenses += Math.abs(amount);
            }
        }

        return {
            income,
            expenses,
            net: income - expenses
        };
    }


    function formatDate(date) {
        return date.toISOString().split('T')[0]; // "YYYY-MM-DD"
    }

    function setDateRangeAllTime() {
        // Extract all timestamps, find min and max
        const dates = Object.values(transactions).map(tr => new Date(tr.timestamp));
        if (dates.length === 0) return;

        // Convert dates to timestamps (numbers)
        const timestamps = dates.map(date => date.getTime());

        const minDate = new Date(Math.min(...timestamps));
        const maxDate = new Date(Math.max(...timestamps));

        filter_date_start = formatDate(minDate);
        filter_date_end = formatDate(maxDate);
    }



    // MOUNT
    onMount(() => {
        update_from_filters()
    });

    // CHARTS
    function generate_bar_data(transactions, mode = 'stacked') {
        const dateToIncome = {};
        const dateToExpense = {};
        let minDate = null;
        let maxDate = null;

        for (const trId in transactions) {
            const tr = transactions[trId];
            const date = tr.timestamp;

            if (!minDate || date < minDate) minDate = date;
            if (!maxDate || date > maxDate) maxDate = date;

            if (!dateToIncome[date]) dateToIncome[date] = 0;
            if (!dateToExpense[date]) dateToExpense[date] = 0;
            
            let conv_amount = fx.convert(tr.amount, {from: tr.currency, to: fx.base});

            if (conv_amount >= 0) {
                dateToIncome[date] += conv_amount;
            } else {
                dateToExpense[date] += conv_amount;
            }
        }

        function getDateRange(start, end) {
            const dateList = [];
            let current = new Date(start);
            const endDate = new Date(end);

            while (current <= endDate) {
            dateList.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
            }

            return dateList;
        }

        const allDates = getDateRange(minDate, maxDate);

        const incomeData = [];
        const expenseData = [];
        const netData = [];

        for (const date of allDates) {
            const income = dateToIncome[date] || 0;
            const expense = dateToExpense[date] || 0;

            incomeData.push(income);
            expenseData.push(expense); // already negative
            netData.push(income + expense); // expense is negative
        }

        const chartData = {
            labels: allDates,
            datasets: []
        };

        switch (mode) {
            case 'stacked':
            chartData.datasets = [
                {
                label: 'Income',
                data: incomeData,
                backgroundColor: 'green',
                stack: 'stack1'
                },
                {
                label: 'Expenses',
                data: expenseData,
                backgroundColor: 'red',
                stack: 'stack1'
                }
            ];
            break;
            case 'net':
            chartData.datasets = [
                {
                    label: 'Net',
                    data: netData,
                    backgroundColor: netData.map(value =>
                        value >= 0 ? 'green' : 'red'
                    )
                }
            ];
            break;
            case 'income_only':
            chartData.datasets = [
                {
                label: 'Income',
                data: incomeData,
                backgroundColor: 'green'
                }
            ];
            break;
            case 'expenses_only':
            chartData.datasets = [
                {
                label: 'Expenses',
                data: expenseData,
                backgroundColor: 'red'
                }
            ];
            break;
            default:
            console.warn('Unknown chart mode:', mode);
        }

        return chartData;
    }

    function getGreenShade() {
        const lightness = Math.floor(Math.random() * 20) + 40; // 40–60%
        return `hsl(140, 60%, ${lightness}%)`;
    }

    function getRedShade() {
        const lightness = Math.floor(Math.random() * 20) + 40;
        return `hsl(0, 60%, ${lightness}%)`;
    }


    function generate_pie_data(transactions, mode = 'split_by_tag') {
        const tagMap = {};

        for (const trId in transactions) {
            const tr = transactions[trId];
            const tags = tr.tags || ['(no tag)'];
            const amount = fx.convert(tr.amount, { from: tr.currency, to: fx.base });

            for (const tag of tags) {
                if (!tagMap[tag]) {
                    tagMap[tag] = { income: 0, expense: 0 };
                }

                if (amount >= 0) {
                    tagMap[tag].income += amount;
                } else {
                    tagMap[tag].expense += amount; // negative
                }
            }
        }

        let labels = [];
        let datasets = [];

        switch (mode) {
            case 'net_by_tag': {
                let entries = Object.entries(tagMap).map(([tag, vals]) => ({
                    tag,
                    value: vals.income + vals.expense,
                    color: (vals.income + vals.expense) >= 0 ? getGreenShade() : getRedShade()
                }));
                entries = entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

                labels = entries.map(e => e.tag);
                datasets = [{
                    label: 'Net by Tag',
                    data: entries.map(e => e.value),
                    backgroundColor: entries.map(e => e.color)
                }];
                break;
            }

            case 'income_by_tag': {
                let entries = Object.entries(tagMap)
                    .filter(([, vals]) => vals.income > 0)
                    .map(([tag, vals]) => ({
                        tag,
                        value: vals.income,
                        color: getGreenShade()
                    }))
                    .sort((a, b) => b.value - a.value);

                labels = entries.map(e => e.tag);
                datasets = [{
                    label: 'Income by Tag',
                    data: entries.map(e => e.value),
                    backgroundColor: entries.map(e => e.color)
                }];
                break;
            }

            case 'expenses_by_tag': {
                let entries = Object.entries(tagMap)
                    .filter(([, vals]) => vals.expense < 0)
                    .map(([tag, vals]) => ({
                        tag,
                        value: -vals.expense, // make positive
                        color: getRedShade()
                    }))
                    .sort((a, b) => b.value - a.value);

                labels = entries.map(e => e.tag);
                datasets = [{
                    label: 'Expenses by Tag',
                    data: entries.map(e => e.value),
                    backgroundColor: entries.map(e => e.color)
                }];
                break;
            }

            case 'split_by_tag': {
                const incomeEntries = [];
                const expenseEntries = [];

                for (const [tag, vals] of Object.entries(tagMap)) {
                    if (vals.income > 0) {
                        incomeEntries.push({
                            label: `+ ${tag}`,
                            value: vals.income,
                            color: getGreenShade()
                        });
                    }
                    if (vals.expense < 0) {
                        expenseEntries.push({
                            label: `- ${tag}`,
                            value: -vals.expense,
                            color: getRedShade()
                        });
                    }
                }

                incomeEntries.sort((a, b) => b.value - a.value);
                expenseEntries.sort((a, b) => b.value - a.value);

                const combined = [...incomeEntries, ...expenseEntries];

                labels = combined.map(e => e.label);
                datasets = [{
                    label: 'Income / Expenses by Tag',
                    data: combined.map(e => e.value),
                    backgroundColor: combined.map(e => e.color)
                }];
                break;
            }

            default:
                console.warn('Unknown pie chart mode:', mode);
        }

        return { labels, datasets };
    }

    function generate_balance_data(transactions, startDateStr, endDateStr) {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        // Sort transactions by timestamp ascending
        const sorted = Object.values(transactions).sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Calculate opening balance by summing all transactions before startDate
        let openingBalance = 0;
        for (const tr of sorted) {
            const trDate = new Date(tr.timestamp);
            if (trDate < startDate) {
            openingBalance += fx.convert(tr.amount, { from: tr.currency, to: fx.base });
            } else {
            break; // rest are after startDate
            }
        }

        // Helper to get all dates between start and end inclusive
        function getDateRange(start, end) {
            const dateList = [];
            let current = new Date(start);
            while (current <= end) {
            dateList.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
            }
            return dateList;
        }

        const allDates = getDateRange(startDate, endDate);

        // Map dates to net transaction amounts on that date
        const dateToNet = {};
        for (const tr of sorted) {
            const trDateStr = tr.timestamp.split('T')[0];
            const trDate = new Date(trDateStr);
            if (trDate >= startDate && trDate <= endDate) {
            if (!dateToNet[trDateStr]) dateToNet[trDateStr] = 0;
            dateToNet[trDateStr] += fx.convert(tr.amount, { from: tr.currency, to: fx.base });
            }
        }

        // Build cumulative balance per date
        const balanceData = [];
        let runningBalance = openingBalance;
        for (const date of allDates) {
            if (dateToNet[date]) {
            runningBalance += dateToNet[date];
            }
            balanceData.push(runningBalance);
        }

        return {
            labels: allDates,
            datasets: [{
            label: 'Balance',
            data: balanceData,
            borderColor: 'white',
            fill: false,
            tension: 0.1
            }]
        };
        }

    function get_bar_options(mode = 'stacked') {
        return {
            responsive: true,
            maintainAspectRatio: false, // full width/height control
            plugins: {
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                tooltip: {
                    backgroundColor: '#333',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function (context) {
                            const label = context.dataset.label || '';
                            const value = context.raw;
                            return `${label}: £${value.toFixed(2)}`;
                        }
                    }
                },
                datalabels: {
                    display: false  // 👈 disables datalabels on bar chart
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    stacked: mode === 'stacked',
                    ticks: {
                        color: '#aaa'
                    }
                },
                y: {
                    stacked: mode === 'stacked',
                    ticks: {
                        color: '#aaa',
                        callback: function (value) {
                            return `£${value}`;
                        }
                    }
                }
            }
        };
    }

    function get_pie_options() {
        return {
            responsive: true,
            plugins: {
                datalabels: {
                    color: '#fff',
                    formatter: (value, context) => {
                        const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                        const percent = (value / total) * 100;
                        return `${percent.toFixed(1)}%`;
                    },
                    font: {
                        weight: 'bold'
                    }
                },
                tooltip: {
                    backgroundColor: '#333',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
                            const value = context.raw;
                            const label = context.label;
                            const percent = ((value / total) * 100).toFixed(1);
                            return `${label}: £${value.toFixed(2)} (${percent}%)`;
                        }
                    }
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                }
            }
        };
    }

    function get_balance_options() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    backgroundColor: '#333',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        label: function (context) {
                            return `£${context.raw.toFixed(2)}`;
                        }
                    }
                },
                legend: {
                    labels: {
                        color: '#fff'
                    }
                },
                // 💡 Remove or disable datalabels if you're using them elsewhere
                datalabels: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: { color: '#ddd' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    beginAtZero: true, // ✅ Force Y-axis to start at 0
                    ticks: {
                        color: '#ddd',
                        callback: (val) => `£${val}`
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        };
    }
</script>

<div class="con-stats">
    <!-- TOP BAR -->
    <div class="con-topbar">
        <div class="con-settings"> 
            <button style="margin-right: 32px" on:click={() => {close_stats()}}>Back to Overview</button>
            <div style="display: flex; flex-direction: column;">
                <div class="con-filters">
                    <span>Start Date:</span>
                <input type="date" bind:value={filter_date_start}>
    
                <span>End Date:</span>
                <input type="date" bind:value={filter_date_end}>
    
                <span>Tags:</span>
                <input type="text" bind:value={filter_tags}>
                <button on:click={() => {filter_tags = "-transfer, -convert"}}>Reset Tags</button>
                </div>
    
                <div class="con-ranges">
                    <strong>Quick Ranges:</strong>
                    <button on:click={() => {setDateRange(7); update_from_filters()}}>7d</button>
                    <button on:click={() => {setDateRange(14); update_from_filters()}}>14d</button>
                    <button on:click={() => {setDateRange(30); update_from_filters()}}>30d</button>
                    <button on:click={() => {setDateRange(90); update_from_filters()}}>90d</button>
                    <button on:click={() => {setDateRange(120); update_from_filters()}}>120d</button>
                    <button on:click={() => {setDateRange(150); update_from_filters()}}>150d</button>
                    <button on:click={() => {setDateRange(365); update_from_filters()}}>365d</button>
                    <button on:click={() => { setDateRangeAllTime(); update_from_filters(); }}>All Time</button>
                </div>
            </div>

            <button on:click={update_from_filters}>Update</button>
        </div>
        <div class="con-totals">
            <span>Income: £{totals.income.toFixed(2)}</span>
            <span>Expenses: £{totals.expenses.toFixed(2)}</span>
            <span>Net: £{totals.net.toFixed(2)}</span>
        </div>
    </div>  
    <!-- BAR & PIE -->
    <div class="con-bar-pie">
        <!-- BAR -->
        <div class="con-chart" style="width: 70%; border-top-right-radius: 8px; border-bottom-right-radius: 8px">
            <select bind:value={bar_mode}>
                <option value="stacked">Stacked</option>
                <option value="net">Net</option>
                <option value="income_only">Income Only</option>
                <option value="expenses_only">Expenses Only</option>
            </select>
            <div class="con-chart-comp">
                <Chart type="bar" data={bar_data} options={bar_options}/>
            </div>
        </div>
        <!-- PIE -->
        <div class="con-chart" style="width: 30%; border-top-left-radius: 8px; border-bottom-left-radius: 8px">
            <select bind:value={pie_mode}>
                <option value="net_by_tag">Net</option>
                <option value="split_by_tag">Income / Expenses</option>
                <option value="income_by_tag">Income Only</option>
                <option value="expenses_by_tag">Expenses Only</option>
                </select>
            <div class="con-chart-comp">
                <Chart type="pie" data={pie_data} options={pie_options}/>
            </div>
        </div>
    </div>
    <div class="con-line">
        <div class="con-chart-comp">
            <Chart type="line" data={balance_data} options={balance_options}/>
        </div>
    </div>
</div>

<style>
.con-stats {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: stretch;
    width: 100%;
    height: 100vh;
    gap: 8px;
}
.con-topbar {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: stretch;

    gap: 8px;

    /* padding: 8px; */
    padding-top: 0px;
}

.con-settings {
    width: 70%;

    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: stretch;

    gap: 12px;
    background-color: #333333;
    padding: 8px;

    border-bottom-right-radius: 8px;
}

.con-totals {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    
    width: 50%;
    gap: 12px;
    background-color: #333333;
    padding: 8px;

    border-bottom-left-radius: 8px;
}

.con-chart {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;

    background-color: #333333;
}

.con-bar-pie {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: stretch;
    width: 100%;
    height: 60%;
    gap: 8px;
}

.con-line {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 40%;
    gap: 8px;

    background-color: #333333;
}

.con-chart-comp {
    width: 95%;
    height: 90%;
}
</style>