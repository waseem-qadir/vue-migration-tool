<template>
  <div id="app">
    <nav class="navbar">
      <router-link to="/">Home</router-link>
      <router-link to="/products">Products</router-link>
      <router-link to="/profile">Profile</router-link>
      <router-link tag="button" to="/login">Login</router-link>
    </nav>
    <main>
      <transition name="slide">
        <router-view />
      </transition>
    </main>
  </div>
</template>

<script>
import Vue from 'vue';
import Router from 'vue-router';

Vue.use(Router);

export default Vue.extend({
  name: 'App',

  data() {
    return {
      appVersion: '1.0.0',
    };
  },

  created() {
    console.log('App created with version:', this.appVersion);
  },

  methods: {
    logout() {
      this.$store.dispatch('auth/logout');
      this.$router.push('/login');
    },
  },
});
</script>

<style>
.navbar {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: #333;
}
.navbar a {
  color: white;
  text-decoration: none;
}
</style>