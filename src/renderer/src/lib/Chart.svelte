<script>
    import { onMount } from 'svelte';
    import Chart from 'chart.js/auto';
  
    export let type = 'bar';
    export let data;
    export let options = {};
  
    let canvas;
    let chart;
  
    onMount(() => {
      if (canvas) {
        chart = new Chart(canvas, {
          // @ts-ignore
          type,
          data,
          options
        });
      }
  
      return () => {
        chart?.destroy();
      };
    });
  
    // Optional: reactively update the chart when props change
   // @ts-ignore
     $: if (chart) {
      chart.data = data;
      chart.options = options;
      chart.update();
    }
  </script>
  
  <canvas bind:this={canvas}></canvas>
  