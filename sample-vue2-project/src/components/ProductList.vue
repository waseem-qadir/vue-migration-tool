<template>
  <div class="product-list">
    <h2>Products</h2>
    <transition name="fade">
      <div v-if="loading" class="loader">Loading...</div>
    </transition>

    <div class="filters">
      <input
        v-model="search"
        type="text"
        placeholder="Search products..."
        @keyup.27="clearSearch"
      />
      <select v-model="selectedCategory">
        <option value="">All Categories</option>
        <option
          v-for="cat in categories"
          :key="cat"
          :value="cat"
        >{{ cat | capitalize }}</option>
      </select>
    </div>

    <div class="grid">
      <div
        v-for="item in filteredProducts"
        :key="item.id"
        class="product-card"
        :class="{ featured: item.featured }"
      >
        <h3>{{ item.name }}</h3>
        <p>{{ item.description }}</p>
        <span class="price">{{ item.price | currency }}</span>
        <button @click.native="addToCart(item)">Add to Cart</button>
      </div>
    </div>

    <p v-if="filteredProducts.length === 0">No products found.</p>
  </div>
</template>

<script>
import Vue from 'vue';
import { mapState, mapGetters, mapActions } from 'vuex';

export default Vue.extend({
  filters: {
    capitalize(value) {
      if (!value) return '';
      return value.charAt(0).toUpperCase() + value.slice(1);
    },
    currency(value) {
      return '$' + parseFloat(value).toFixed(2);
    },
  },

  data() {
    return {
      search: '',
      selectedCategory: '',
    };
  },

  computed: {
    ...mapState('products', ['items', 'loading', 'error']),
    ...mapGetters('products', ['categories', 'featuredItems']),

    filteredProducts() {
      let items = this.items;
      if (this.search) {
        const q = this.search.toLowerCase();
        items = items.filter((p) => p.name.toLowerCase().includes(q));
      }
      if (this.selectedCategory) {
        items = items.filter((p) => p.category === this.selectedCategory);
      }
      return items;
    },
  },

  methods: {
    ...mapActions('products', ['fetchProducts']),
    ...mapActions('cart', ['addToCart']),

    clearSearch() {
      Vue.set(this, 'search', '');
    },
  },

  created() {
    this.fetchProducts();
  },

  mounted() {
    this.$listeners;
  },
});
</script>

<style scoped>
.product-list {
  padding: 1rem;
}
</style>