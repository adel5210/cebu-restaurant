import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const routes = [

  {
    path: '/',
    name: 'cebu-restaurant',
    component: () => import('@/views/CebuRestaurantView')
  }
]

const router = new VueRouter({
  routes
})

export default router
