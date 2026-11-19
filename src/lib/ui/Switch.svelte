<script lang="ts">
  interface Props {
    on: boolean;
    onchange: (v: boolean) => void;
    label?: string;
  }
  let { on, onchange, label }: Props = $props();
</script>

<button class="switch" class:on role="switch" aria-checked={on} aria-label={label} onclick={() => onchange(!on)}>
  <i></i>
</button>
