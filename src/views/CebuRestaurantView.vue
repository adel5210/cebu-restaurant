<template>
  <v-content style="width: 100%; height: 100%;">
    <GmapMap
        v-if="centerMapPosition"
        id="map"
        ref="mapRef"
        :center="centerMapPosition"
        :style="googleMapSIze"
        :zoom="15"
        map-type-id="terrain"
    >
      <GmapMarker v-for="(plot, index) in filteredRestaurantPlots"
                  :key="index"
                  ref="mapMarkers"
                  :icon="pinSymbol(plot.colorMarker)"
                  :position="google && new google.maps.LatLng(plot.position[0], plot.position[1])"
                  @click="openInfoWindowTemplate(plot)"
      />
      <gmap-info-window
          :opened="infoWindow.open"
          :options="{maxWidth: 300, pixelOffset: { width: 0, height: -35 }}"
          :position="infoWindow.position"
          @closeclick="infoWindow.open=false">
        <div v-html="infoWindow.template"></div>
      </gmap-info-window>
      <GmapPolygon
          v-if="showPolygon"
          ref="mapPolygon"
          :draggable="true"
          :editable="true"
          :paths="userPolygonPath"
          @paths_changed="updatePolygon($event)"
      >
      </GmapPolygon>
      <DirectionsRenderer
          v-if="end"
          :destination="destionation"
          :origin="origin"
          travelMode="DRIVING"/>
    </GmapMap>

    <v-bottom-navigation ref="bttmNav" v-model="selectedBottomNavbar" background-color="#F5F5F5" grow height="50" light>
      <v-menu :close-on-click="showRestaurantTypes"
              :offset-y=true
              top>
        <template v-slot:activator="{ on, attrs }">
          <v-btn v-bind="attrs" v-on="on"
                 value="restaurant_types"
                 x-large
                 @click="showRestaurantTypes !== showRestaurantDetail">
            <span>Restaurant types</span>
            <v-icon>mdi-list-box-outline</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item v-for="(item, index) in restaurantTypes"
                       :key="index"
                       link
                       @click="selectedRestaurantType = item">
            <v-list-item-title v-text="item.type"/>
          </v-list-item>
        </v-list>
      </v-menu>

      <v-btn value="show_polygon" x-large
             @click="spawnPolygon()">
        <span>Draw</span>
        <v-icon>mdi-vector-polygon-variant</v-icon>
      </v-btn>

      <v-btn v-if="showGoNow " value="goto" x-large @click="rerouteToRestaurant">
        <span>Go now</span>
        <v-icon>mdi-map-marker-radius-outline</v-icon>
      </v-btn>
      <v-btn v-if="!showGoNow && null!=selectedRp.name" value="reset" x-large @click="resetRoute(true)">
        <span>Reset</span>
        <v-icon>mdi-map-marker-radius-outline</v-icon>
      </v-btn>

      <v-btn v-if="showGoNow" value="show_details" x-large @click="showRestaurantDetail=!showRestaurantDetail">
        <span>Show details</span>
        <v-icon>mdi-silverware</v-icon>
      </v-btn>

      <v-btn v-if="showPolygon" value="count_polygon"
             x-large>
        <strong>Count: {{ countRestaurants }}</strong>
      </v-btn>

    </v-bottom-navigation>
    <v-bottom-sheet
        v-model="showRestaurantDetail"
        hide-overlay
        inset
    >
      <v-card v-if="showRestaurantDetail" style="margin-bottom: 70px">
        <v-card-title>{{ selectedRp.name }}</v-card-title>
        <v-card-text>
          Type: {{ restaurantTypes.find(f => f.id === selectedRp.restaurant_type).type }}
          <br>
          Address: {{ selectedRp.address }}
          <br>
          Special Meals: {{ selectedRp.special_meals }}
          <br>
          Visited count: {{ selectedRp.visited_count }}
          <br>
          Ratings: {{ selectedRp.rating }}
        </v-card-text>
        <v-card-actions>
          <section v-if="!selectedRp.setVisited" style="display: inline-flex; align-items: center">
            Have you visited this place?
            <v-spacer></v-spacer>
            <section v-if="null==selectedRp.setVisited">
              <v-btn :loading="showVisitLoading"
                     class="mr-2 ml-2"
                     outlined
                     rounded
                     @click="onVisited(true)"
              >Yes
              </v-btn>
              <v-btn
                  outlined
                  rounded
                  @click="onVisited( false)"
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
                v-model="selectedRp.setRating"
                @input="onRating"
                class="ml-2"
                color="yellow accent-4"
                dense
                hover
            />
          </section>
        </v-card-actions>

        <v-card-actions>
          <v-btn
              block
              depressed
              large
              outlined
              raised
              @click="resetDetails"
          >CLOSE
          </v-btn>
        </v-card-actions>
      </v-card>

    </v-bottom-sheet>
    <v-footer
        :padless="true"
        height="20"
        style="justify-content: center"
    >Created by: Adel Mahmoud Sadek - <strong> Cebu Restaurants </strong> - 2023
    </v-footer>
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

      centerMapPosition: {lat: 1, lng: 1},
      restaurantPlots: [],
      restaurantTypes: [],
      userPlots: {lat: 1, lng: 1},
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
        id: null,
        name: null,
        address: null,
        rating: null,
        special_meals: null,
        restaurant_type: null,
        setVisited: null,
        setRating: null,
        visited_count: null
      },
      selectedRestaurantType: null,

      showGoNow: false,
      showRestaurantDetail: false,
      showRestaurantTypes: false,
      showVisitLoading: false,

      showPolygon: false,
      userPolygonPath: [],
      countRestaurants: 0

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
        location: this.centerMapPosition
      };

      if (null != temp_next_page_token) {
        request.pagetoken = temp_next_page_token;
      }

      console.log(request);

      let service = new this.google.maps.places.PlacesService(map);
      service.nearbySearch(request, (results, status) => {
        if (status === 'OK') {
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
      // console.log(data);
      this.restaurantTypes = data;
    },
    async retrieveSpecialMeals(id) {
      return supabase.from('special_meal')
          .select('name')
          .eq('restaurant', id);
    },
    async retrieveVisitedRestaurant(id) {
      return supabase
          .from('visited_restaurant')
          .select('id')
          .eq('restaurant', id);
    },
    async retrieveRatingRestaurant(id) {
      return supabase
          .from('rating_restaurant')
          .select('id,rating')
          .eq('restaurant', id);
    },
    async retrieveRestaurants() {
      const {data} = await supabase.from('restaurant')
          .select()
      for (let i = 0; i < data.length; i++) {
        this.restaurantPlots.push({
          id: data[i].id,
          position: [Number(data[i].lat), Number(data[i].lng)],
          name: data[i].name,
          address: data[i].address,
          rating: null,
          colorMarker: 'red',
          restaurant_type: data[i].restaurant_type,
          setVisited: null,
          setRating: null,
          visited_count: null
        });
      }

    },
    async retrieveDefaultConfig() {
      const {data} = await supabase.from('default_config')
          .select()
          .eq('id', 1)
      // console.log(data);
      this.centerMapPosition = {
        lat: data[0].lat,
        lng: data[0].lng
      }

    },
    async openInfoWindowTemplate(selectedMarker) {
      let rp = selectedMarker;
      let rp_sm = await this.retrieveSpecialMeals(rp.id);
      selectedMarker.special_meals = rp_sm.data.map(m => m.name).join(", ")
      let visited_count = await this.retrieveVisitedRestaurant(rp.id);
      selectedMarker.visited_count = visited_count.data.length;
      let ratings_restaurant = await this.retrieveRatingRestaurant(rp.id);
      selectedMarker.rating = 0;
      for (let i = 0; i < ratings_restaurant.data.length; i++) {
        selectedMarker.rating = ratings_restaurant.data[i].rating / (i + 1);
      }
      console.log(selectedMarker.rating)

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
      this.googleMapSIze = 'width: 100%; height:' + (this.windowSize.y - (50 + 20)) + 'px';
    },
    currentLocation() {
      navigator.geolocation.getCurrentPosition(
          position => {
            this.userPlots = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            }
            this.hasEnableUserMarker = true;
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
    resetRoute(withSelectedRp) {
      this.start = null;
      this.end = null;
      if (withSelectedRp) {
        this.selectedRp = {
          id: null,
          name: null,
          address: null,
          rating: null,
          special_meals: null,
          restaurant_type: null,
          setRating: null,
          setVisited: null,
          visited_count: null
        };
      }
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
    async onVisited(hasVisit) {
      this.selectedRp.setVisited = hasVisit
      if (hasVisit) {
        this.showVisitLoading = true;
        this.currentLocation();
        const {data, error} = await supabase
            .from('visited_restaurant')
            .insert([
              {
                restaurant: this.selectedRp.id,
                user_lat: String(this.userPlots.lat),
                user_lng: String(this.userPlots.lng)
              },
            ])
        this.selectedRp.visited_count = this.selectedRp.visited_count + 1;
        if (data || error) {
          if (error) {
            console.error(error)
          }
        }
      }
      this.showVisitLoading = false;
    },
    async onRating() {
      const {data, error} = await supabase
          .from('rating_restaurant')
          .insert([
            {restaurant: this.selectedRp.id, rating: this.selectedRp.setRating},
          ])
      if (data || error) {
        if (error) {
          console.error(error)
        }
      }
    },
    resetDetails() {
      this.showRestaurantDetail = false;
      this.selectedRp.setRating = null;
      this.selectedRp.setVisited = null;
    },
    spawnPolygon() {
      this.showPolygon = !this.showPolygon;
      if (this.showPolygon) {
        const centerMapPosition = {
          lat: this.$refs.mapRef.$mapObject.center.lat(),
          lng: this.$refs.mapRef.$mapObject.center.lng()
        }
        this.userPolygonPath = [
          {lat: centerMapPosition.lat - 0.003, lng: centerMapPosition.lng - 0.003},
          {lat: centerMapPosition.lat + 0.003, lng: centerMapPosition.lng - 0.003},
          {lat: centerMapPosition.lat + 0.003, lng: centerMapPosition.lng + 0.003},
          {lat: centerMapPosition.lat - 0.003, lng: centerMapPosition.lng + 0.003},
        ]
      }

    },
    updatePolygon() {

      // console.log(mvcArray)
      this.countRestaurants = 0;
      // console.log(this.$refs.mapPolygon)
      this.$refs.mapPolygon.$polygonPromise.then(polygon => {
        for (let i = 0; i < this.$refs.mapMarkers.length; i++) {
          this.$refs.mapMarkers[i].$markerPromise.then(mark => {
            if (this.google.maps.geometry.poly.containsLocation(mark.getPosition(), polygon)) {
              this.countRestaurants = this.countRestaurants + 1
            }
          })
        }
      })
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
    filteredRestaurantPlots() {
      this.resetRoute(false);
      return null !== this.selectedRestaurantType ?
          this.restaurantPlots.filter(f => f.restaurant_type === this.selectedRestaurantType.id)
          : this.restaurantPlots;

    },

  },
  watch: {},
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