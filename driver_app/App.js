import React, { Component } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Alert
} from 'react-native';

import Pusher from 'pusher-js/react-native';
import MapView from 'react-native-maps';
import Geocoder from 'react-native-geocoding';

import { regionFrom, getLatLonDiffInMeters } from './helpers';

Geocoder.setApiKey('YOUR GOOGLE SERVER API KEY');

export default class grabDriver extends Component {
  state = {
    passenger: null,
    region: null,
    accuracy: null,
    nearby_alert: false,
    has_passenger: false,
    has_ridden: false
  }

  constructor() {
    super();

    this.available_drivers_channel = null; 
    this.ride_channel = null;    
    this.pusher = null;

    console.ignoredYellowBox = [
      'Setting a timer'
    ];
  }


  componentWillMount() {

    this.pusher = new Pusher('YOUR PUSHER APP ID', {
      authEndpoint: 'YOUR AUTH SERVER ENDPOINT',
      cluster: 'YOUR PUSHER CLUSTER',
      encrypted: true
    });

    this.available_drivers_channel = this.pusher.subscribe('private-available-drivers');

    this.available_drivers_channel.bind('client-driver-request', (passenger_data) => {
      
      if(!this.state.has_passenger){

        Alert.alert(
          "You got a passenger!",
          "Pickup: " + passenger_data.pickup.name + "\nDrop off: " + passenger_data.dropoff.name,
          [
            {
              text: "Later bro", 
              onPress: () => {
                console.log('Cancel Pressed');
              },
              style: 'cancel'
            },
            {
              text: 'Gotcha!', 
              onPress: () => {
                
                this.ride_channel = this.pusher.subscribe('private-ride-' + passenger_data.username);
                this.ride_channel.bind('pusher:subscription_succeeded', () => {
                 
                  this.ride_channel.trigger('client-driver-response', {
                    response: 'yes'
                  });

                  this.ride_channel.bind('client-driver-response', (driver_response) => {
                    
                    if(driver_response.response == 'yes'){

                      this.setState({
                        has_passenger: true,
                        passenger: {
                          username: passenger_data.username,
                          pickup: passenger_data.pickup,
                          dropoff: passenger_data.dropoff
                        }
                      });

                      Geocoder.getFromLatLng(this.state.region.latitude, this.state.region.longitude).then(
                        (json) => {
                          var address_component = json.results[0].address_components[0];
                          
                          this.ride_channel.trigger('client-found-driver', { 
                            driver: {
                              name: 'John Smith'
                            },
                            location: {
                              name: address_component.long_name,
                              latitude: this.state.region.latitude,
                              longitude: this.state.region.longitude,
                              accuracy: this.state.accuracy
                            }
                          });

                        },
                        (error) => {
                          console.log('err geocoding: ', error);
                        }
                      );  

                    }else{
                      
                      Alert.alert(
                        "Too late bro!",
                        "Another driver beat you to it.",
                        [
                          {
                            text: 'Ok'
                          },
                        ],
                        { cancelable: false }
                      );
                    }

                  });

                });

              }
            },
          ],
          { cancelable: false }
        );
      }

    });
  }


  componentDidMount() {

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
       
        var region = regionFrom(
          position.coords.latitude, 
          position.coords.longitude, 
          position.coords.accuracy
        );
       
        this.setState({
          region: region,
          accuracy: position.coords.accuracy
        });

        if(this.state.has_passenger && this.state.passenger){
          
          var diff_in_meter_pickup = getLatLonDiffInMeters(
            position.coords.latitude, position.coords.longitude, 
            this.state.passenger.pickup.latitude, this.state.passenger.pickup.longitude);

          if(diff_in_meter_pickup <= 20){
            
            if(!this.state.has_ridden){
              
              this.ride_channel.trigger('client-driver-message', {
                type: 'near_pickup',
                title: 'Just a heads up',
                msg: 'Your driver is near, let your presence be known!'
              });

              this.setState({
                has_ridden: true
              });

            }

          }else if(diff_in_meter_pickup <= 50){

            if(!this.state.nearby_alert){

              this.setState({
                nearby_alert: true
              });

              Alert.alert(
                "Slow down",
                "Your passenger is just around the corner",
                [
                  {
                    text: 'Gotcha!'
                  },
                ],
                { cancelable: false }
              );

            }
          
          }

          var diff_in_meter_dropoff = getLatLonDiffInMeters(
            position.coords.latitude, position.coords.longitude, 
            this.state.passenger.dropoff.latitude, this.state.passenger.dropoff.longitude);

          if(diff_in_meter_dropoff <= 20){
            this.ride_channel.trigger('client-driver-message', {
              type: 'near_dropoff',
              title: "Brace yourself",
              msg: "You're very close to your destination. Please prepare your payment."
            });

            this.ride_channel.unbind('client-driver-response');
            this.pusher.unsubscribe('private-ride-' + this.state.passenger.username);

            this.setState({
              passenger: null,
              has_passenger: false,
              has_ridden: false
            });

          }

          this.ride_channel.trigger('client-driver-location', { 
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });

        }

      },
      (error) => this.setState({ error: error.message }),
      { 
        enableHighAccuracy: true, timeout: 20000, maximumAge: 1000, distanceFilter: 10 
      },
    );
  }


  componentWillUnmount() {
    navigator.geolocation.clearWatch(this.watchId);
  }


  render() {
    return (
      <View style={styles.container}>
        {
          this.state.region && 
          <MapView
            style={styles.map}
            region={this.state.region}
          >
              <MapView.Marker
                coordinate={{
                latitude: this.state.region.latitude, 
                longitude: this.state.region.longitude}}
                title={"You're here"}
              />
              
              {
                this.state.passenger && !this.state.has_ridden && 
                <MapView.Marker
                  coordinate={{
                  latitude: this.state.passenger.pickup.latitude, 
                  longitude: this.state.passenger.pickup.longitude}}
                  title={"Your passenger is here"}
                  pinColor={"#4CDB00"}
                />
              }
          </MapView>
        }
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});