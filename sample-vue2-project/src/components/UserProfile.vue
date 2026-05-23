<template>
  <div class="user-profile">
    <div class="avatar">
      <img :src="user.avatar" :alt="user.name" />
    </div>
    <div class="info">
      <h2>{{ user.name }}</h2>
      <p>{{ user.email | obscure }}</p>
      <span class="role">{{ user.role }}</span>
    </div>
    <div class="actions">
      <button @click.stop="editProfile" class="btn-edit">Edit</button>
      <button @click.stop="deleteProfile" class="btn-delete">Delete</button>
    </div>

    <slot name="extra"></slot>
    <div slot-scope="slotProps">
      <slot name="custom-footer" :user="user"></slot>
    </div>
  </div>
</template>

<script>
import Vue from 'vue';

export default Vue.extend({
  props: {
    user: {
      type: Object,
      required: true,
    },
  },

  functional: true,

  filters: {
    obscure(email) {
      return email.replace(/(.{2}).*(@.*)/, '$1***$2');
    },
  },

  data() {
    return {
      isEditing: false,
    };
  },

  beforeCreate() {
    this.isEditing = false;
  },

  computed: {
    roleLabel() {
      return this.user.role.toUpperCase();
    },
  },

  watch: {
    user: {
      handler(newVal, oldVal) {
        console.log('User changed:', oldVal, '->', newVal);
      },
      deep: true,
    },
  },

  methods: {
    editProfile() {
      this.$emit('edit', this.user);
    },

    deleteProfile() {
      this.$emit('delete', this.user.id);
    },
  },

  render(h) {
    return h('div', { class: 'render-fallback' }, [
      h('p', 'Rendered from render function'),
    ]);
  },
});
</script>

<style scoped>
.user-profile {
  display: flex;
  gap: 1rem;
}
</style>