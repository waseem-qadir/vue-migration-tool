<template>
  <div class="login-form">
    <h2>Login</h2>
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label>
          <input
            v-model="form.username"
            type="text"
            placeholder="Username"
            @keyup.13="submitOnEnter"
          />
        </label>
      </div>
      <div class="form-group">
        <label>
          <input
            slot="password-input"
            v-model="form.password"
            type="password"
            placeholder="Password"
          />
        </label>
      </div>
      <button
        type="submit"
        :disabled="form.username === '' || form.password === ''"
        @click.native="trackClick"
      >
        Sign In
      </button>
    </form>
    <p class="error" v-if="error">{{ error }}</p>
    <router-link tag="a" to="/forgot-password" append>Forgot password?</router-link>
  </div>
</template>

<script>
import Vue from 'vue';

export default Vue.extend({
  data() {
    return {
      form: {
        username: '',
        password: '',
      },
      error: null,
    };
  },

  created() {
    this.$on('session:expired', this.handleSessionExpired);
  },

  beforeDestroy() {
    this.$off('session:expired', this.handleSessionExpired);
  },

  destroyed() {
    console.log('Login component destroyed');
  },

  computed: {
    isFormValid() {
      return this.form.username.length > 0 && this.form.password.length > 0;
    },
  },

  methods: {
    async handleSubmit() {
      if (!this.isFormValid) return;

      try {
        const user = await this.$store.dispatch('auth/login', this.form);
        this.$emit('login-success', user);
      } catch (err) {
        Vue.set(this, 'error', err.message);
      }
    },

    submitOnEnter() {
      this.handleSubmit();
    },

    trackClick() {
      this.$emit('button-click');
    },

    handleSessionExpired() {
      this.error = 'Session expired, please login again.';
    },
  },
});
</script>

<style scoped>
.login-form {
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem;
}
</style>