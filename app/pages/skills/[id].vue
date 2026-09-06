<script setup lang="ts">
const route = useRoute()
const id = computed(() => String(route.params.id))
</script>

<template>
  <pre class="font-mono text-xs">{{ id }}</pre>
</template>
