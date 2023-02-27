<template>
  <v-content style="width: 100%; height: 100%;">
    <GmapMap
        id="map"
        ref="mapRef"
        v-if="cebuPosition"
        :center="cebuPosition"
        :zoom="15"
        map-type-id="terrain"
        :style="googleMapSIze"
    >
      <GmapMarker v-for="(plot, index) in filteredRestaurantPlots"
                  :key="index"
                  @click="openInfoWindowTemplate(plot)"
                  :icon="pinSymbol(plot.colorMarker)"
                  :position="google && new google.maps.LatLng(plot.position[0], plot.position[1])"
      />
      <gmap-info-window
          :options="{maxWidth: 300, pixelOffset: { width: 0, height: -35 }}"
          :position="infoWindow.position"
          :opened="infoWindow.open"
          @closeclick="infoWindow.open=false">
        <div v-html="infoWindow.template"></div>
      </gmap-info-window>

      <!--      <GmapMarker v-if="hasEnableUserMarker"-->
      <!--                  :icon="mapMarkerIcon1"-->
      <!--                  :position="google && new google.maps.LatLng(userPlots.lat, userPlots.lng)"-->
      <!--      />-->

      <DirectionsRenderer
          v-if="end"
          travelMode="DRIVING"
          :origin="origin"
          :destination="destionation"/>
    </GmapMap>
    <v-bottom-navigation v-model="selectedBottomNavbar" ref="bttmNav" height="50" light grow>
      <v-menu top
              :offset-y=true
              :close-on-click="showRestaurantTypes">
        <template v-slot:activator="{ on, attrs }">
          <v-btn value="restaurant_types" x-large
                 @click="showRestaurantTypes !== showRestaurantDetail"
                 v-bind="attrs"
                 v-on="on">
            <span>Restaurant types</span>
            <v-icon>mdi-list-box-outline</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item v-for="(item, index) in restaurantTypes"
                       link
                       @click="selectedRestaurantType = item"
                       :key="index">
            <v-list-item-title v-text="item.type"/>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn value="goto" x-large v-if="showGoNow " @click="rerouteToRestaurant">
        <span>Go now</span>
        <v-icon>mdi-map-marker-radius-outline</v-icon>
      </v-btn>
      <v-btn value="reset" x-large v-if="!showGoNow && null!=selectedRp.name" @click="resetRoute">
        <span>Reset</span>
        <v-icon>mdi-map-marker-radius-outline</v-icon>
      </v-btn>

      <v-btn value="show_details" x-large v-if="showGoNow" @click="showRestaurantDetail=!showRestaurantDetail">
        <span>Show details</span>
        <v-icon>mdi-silverware</v-icon>
      </v-btn>


    </v-bottom-navigation>

    <v-bottom-sheet
        v-model="showRestaurantDetail"
        inset
        hide-overlay
    >
      <v-card style="margin-bottom: 50px" v-if="showRestaurantDetail">
        <v-card-title>{{ selectedRp.name }}</v-card-title>
        <v-card-text>
          Type: {{ restaurantTypes.find(f => f.id === selectedRp.restaurant_type).type }}
          <br>
          Address: {{ selectedRp.address }}
          <br>
          Special Meals: {{ selectedRp.special_meals }}
          <br>
          Ratings: {{ selectedRp.rating }}
        </v-card-text>
        <v-card-actions>
          <section style="display: inline-flex; align-items: center" v-if="!selectedRp.setVisited">
            Have you visited this place?
            <v-spacer></v-spacer>
            <section v-if="null==selectedRp.setVisited">
              <v-btn outlined
                     class="mr-2 ml-2"
                     @click="onVisited(true)"
                     rounded
              >Yes
              </v-btn>
              <v-btn
                  outlined
                  rounded
                  @click="onVisited(false)"
              >No
              </v-btn>
            </section>
            <section v-if="null!==selectedRp.setVisited && !selectedRp.setVisited">
              <span class="ml-2">Then visit it now</span>
            </section>
          </section>
          <section v-if="selectedRp.setVisited" style="display: inline-flex">
            Give it a rate
            <v-spacer></v-spacer>
            <v-rating
                class="ml-2"
                v-model="selectedRp.setRating"
                color="yellow accent-4"
                dense
                hover
            />
          </section>
        </v-card-actions>

        <v-card-actions>
          <v-btn
              raised
              block
              large
              depressed
              outlined
              @click="resetDetails"
          >CLOSE
          </v-btn>
        </v-card-actions>
      </v-card>

    </v-bottom-sheet>
  </v-content>
</template>

<script>
import {gmapApi} from 'vue2-google-maps'
import {supabase} from "@/lib/supabaseClient";
import DirectionsRenderer from "@/components/DirectionsRenderer";
import mapMarkerIcon1 from '@/assets/map-marker-check-outline-custom.png'

export default {
  name: "CebuRestaurantView",
  components: {
    DirectionsRenderer
  },
  data() {
    return {
      hasEnableUserMarker: false,

      cebuPosition: {lat: 1, lng: 1},
      restaurantPlots: [],
      restaurantTypes: [],
      userPlots: {lat: 1, lng: 1},
      nextPageTokenApi: null,
      start: "",
      end: "",

      infoWindow: {
        position: {lat: 0, lng: 0},
        open: false,
        template: ''
      },

      selectedBottomNavbar: 'goto',
      windowSize: {x: 0, y: 0},

      googleMapSIze: '',
      mapMarkerIcon1,

      selectedRestaurant: {},
      selectedRp: {
        name: null,
        address: null,
        rating: null,
        special_meals: null,
        restaurant_type: null,
        setVisited: null,
        setRating: null
      },
      selectedRestaurantType: null,
      
      showGoNow: false,
      showRestaurantDetail: false,
      showRestaurantTypes: false

    }
  },
  methods: {
    retrieveNearbyRestaurants(map) {
      this.retrieveNearbyRestaurantsGoogleApi(map, null);
      console.log(this.restaurantPlots);
    },
    retrieveNearbyRestaurantsGoogleApi(map, temp_next_page_token) {
      let request = {
        type: ['restaurant'],
        radius: 5500,
        location: this.cebuPosition
      };

      if (null != temp_next_page_token) {
        request.pagetoken = temp_next_page_token;
      }

      console.log(request);

      let service = new this.google.maps.places.PlacesService(map);
      service.nearbySearch(request, (results, status, next_page_token) => {
        if (status === 'OK') {
          console.log(results);
          console.log(next_page_token);
          // setTimeout(() => {
          //   if (next_page_token.hasNextPage) {
          //     temp_next_page_token = next_page_token;
          //     console.log(next_page_token);
          //     this.retrieveNearbyRestaurantsGoogleApi(map, temp_next_page_token);
          //   }
          // }, 3000);
          for (let i = 0; i < results.length; i++) {
            this.restaurantPlots.push({
              position: [results[i].geometry.location.lat(), results[i].geometry.location.lng()]
            });
          }
        }
      });
    },
    async retrieveRestaurantTypes() {
      const {data} = await supabase.from('restaurant_type')
          .select('id,type')
      console.log(data);
      this.restaurantTypes = data;
    },
    async retrieveSpecialMeals(id) {
      return supabase.from('special_meal')
          .select('name')
          .eq('restaurant', id);
    },
    async retrieveRestaurants() {
      const {data} = await supabase.from('restaurant')
          .select()
      console.log(data)
      for (let i = 0; i < data.length; i++) {
        this.restaurantPlots.push({
          id: data[i].id,
          position: [Number(data[i].lat), Number(data[i].lng)],
          name: data[i].name,
          address: data[i].address,
          rating: data[i].rating,
          colorMarker: 'red',
          restaurant_type: data[i].restaurant_type,
          setVisited: null,
          setRating: null
        });
      }
      console.log(this.restaurantPlots);

    },
    async retrieveDefaultConfig() {
      const {data} = await supabase.from('default_config')
          .select()
          .eq('id', 1)
      console.log(data);
      this.cebuPosition = {
        lat: data[0].lat,
        lng: data[0].lng
      }

    },
    async openInfoWindowTemplate(selectedMarker) {
      console.log(this.restaurantTypes)
      let rp = selectedMarker;
      let rp_sm = await this.retrieveSpecialMeals(rp.id);
      selectedMarker.special_meals = rp_sm.data.map(m => m.name).join(", ")
      for (let i = 0; i < this.restaurantPlots.length; i++) {
        this.restaurantPlots[i].colorMarker = 'red'
      }
      selectedMarker.colorMarker = 'blue'
      this.infoWindow.position = {lat: rp.position[0], lng: rp.position[1]}
      this.infoWindow.template = `<b>${rp.name}</b>
                                  <br>
                                  ${rp.address}`
      this.infoWindow.open = true
      this.showGoNow = true;
      this.selectedRp = rp;
    },
    screenResize() {
      this.windowSize = {x: window.innerWidth, y: window.innerHeight}
    },
    readjustSize() {
      this.googleMapSIze = 'width: 100%; height:' + (this.windowSize.y - 50) + 'px';
    },
    currentLocation() {
      navigator.geolocation.getCurrentPosition(
          position => {
            this.userPlots = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            }
            this.hasEnableUserMarker = true;
            console.log(this.userPlots);
            this.start = this.google && new this.google.maps.LatLng(this.userPlots.lat, this.userPlots.lng);
          },
          error => {
            console.log(error);
          }
      )
    },
    rerouteToRestaurant() {
      let rp = this.selectedRp;
      this.currentLocation();
      this.end = this.google && new this.google.maps.LatLng(rp.position[0], rp.position[1]);
      this.showGoNow = false;
    },
    resetRoute() {
      this.start = null;
      this.end = null;
      this.selectedRp = {
        name: null,
        address: null,
        rating: null,
        special_meals: null,
        restaurant_type: null,
        setRating: null,
        setVisited: null
      };
      this.infoWindow = {
        position: {lat: 0, lng: 0},
        open: false,
        template: ''
      };
      for (let i = 0; i < this.restaurantPlots.length; i++) {
        this.restaurantPlots[i].colorMarker = 'red'
      }

    },
    pinSymbol(color) {
      return {
        path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#000',
        strokeWeight: 1,
        scale: 1
      };
    },
    onVisited(hasVisit) {
      this.selectedRp.setVisited = hasVisit
    },
    resetDetails() {
      this.showRestaurantDetail = false;
      this.selectedRp.setRating = null;
      this.selectedRp.setVisited = null;
    }
  },
  computed: {
    google: gmapApi,
    origin() {
      if (!this.start) return null;
      return this.start;
    },
    destionation() {
      if (!this.end) return null;
      return this.end;
    },
    filteredRestaurantPlots(){
      return null!==this.selectedRestaurantType ?
          this.restaurantPlots.filter(f => f.restaurant_type === this.selectedRestaurantType.id)
          : this.restaurantPlots;
      
    }
  },
  watch: {
    nextPageTokenApi(newT) {
      console.log(newT)
    }
  },
  mounted() {
    this.screenResize();
    this.readjustSize();
    this.retrieveDefaultConfig().then(() => {
      this.$refs.mapRef.$mapPromise.then(() => {
        this.currentLocation();
        this.retrieveRestaurantTypes();

        // this.retrieveNearbyRestaurants(map);
        this.retrieveRestaurants();

      })

    });


  }
}
</script>

<style scoped>

</style>