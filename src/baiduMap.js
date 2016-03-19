/**
 *  A directive which helps you easily show a baidu-map on your page.
 *
 *
 *  Usages:
 *
 *      <baidu-map options='options'></baidu-map>
 *
 *      options: The configurations for the map
 *            .center.longitude[Number]{M}: The longitude of the center point
 *            .center.latitude[Number]{M}: The latitude of the center point
 *            .zoom[Number]{O}:         Map's zoom level. This must be a number between 3 and 19
 *            .navCtrl[Boolean]{O}:     Whether to add a NavigationControl to the map
 *            .scaleCtrl[Boolean]{O}:   Whether to add a ScaleControl to the map
 *            .overviewCtrl[Boolean]{O}: Whether to add a OverviewMapControl to the map
 *            .enableScrollWheelZoom[Boolean]{O}: Whether to enableScrollWheelZoom to the map
 *            .city[String]{M}:         The city name which you want to display on the map
 *            .markers[Array]{O}:       An array of marker which will be added on the map
 *                   .longitude{M}:                The longitude of the marker
 *                   .latitude{M}:                 The latitude of the marker
 *                   .icon[String]{O}:             The icon's url for the marker
 *                   .width[Number]{O}:            The icon's width for the icon
 *                   .height[Number]{O}:           The icon's height for the icon
 *                   .title[String]{O}:            The title on the infowindow displayed once you click the marker
 *                   .content[String]{O}:          The content on the infowindow displayed once you click the marker
 *                   .enableMessage[Boolean]{O}:   Whether to enable the SMS feature for this marker window. This option only available when title/content are defined.
 *
 *  @author      Howard.Zuo
 *  @copyright   Jun 9, 2015
 *  @version     1.2.0
 *
 *  @author fenglin han
 *  @copyright 6/9/2015
 *  @version 1.1.1
 *
 *  Usages:
 *
 *  <baidu-map options='options' ></baidu-map>
 *  comments: An improvement that the map should update automatically while coordinates changes
 *
 *  @version 1.2.1
 *  comments: Accounding to 史魁杰's comments, markers' watcher should have set deep watch equal to true, and previous overlaies should be removed
 *
 */
(function(global, factory) {
    'use strict';

    if (typeof exports === 'object') {
        module.exports = factory(require('angular'));
    } else if (typeof define === 'function' && define.amd) {
        define(['angular'], factory);
    } else {
        factory(global.angular);
    }

}(window, function(angular) {
    'use strict';

    var GPS = {
        PI : 3.14159265358979324,
        x_pi : 3.14159265358979324 * 3000.0 / 180.0,
        delta : function (lat, lon) {
            // Krasovsky 1940
            //
            // a = 6378245.0, 1/f = 298.3
            // b = a * (1 - f)
            // ee = (a^2 - b^2) / a^2;
            var a = 6378245.0; //  a: 卫星椭球坐标投影到平面地图坐标系的投影因子。
            var ee = 0.00669342162296594323; //  ee: 椭球的偏心率。
            var dLat = this.transformLat(lon - 105.0, lat - 35.0);
            var dLon = this.transformLon(lon - 105.0, lat - 35.0);
            var radLat = lat / 180.0 * this.PI;
            var magic = Math.sin(radLat);
            magic = 1 - ee * magic * magic;
            var sqrtMagic = Math.sqrt(magic);
            dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * this.PI);
            dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * this.PI);
            return {'lat': dLat, 'lon': dLon};
        },

        //WGS-84 to GCJ-02
        gcj_encrypt : function (wgsLat, wgsLon) {
            if (this.outOfChina(wgsLat, wgsLon))
                return {'lat': wgsLat, 'lon': wgsLon};

            var d = this.delta(wgsLat, wgsLon);
            return {'lat' : wgsLat + d.lat,'lon' : wgsLon + d.lon};
        },
        //GCJ-02 to WGS-84
        gcj_decrypt : function (gcjLat, gcjLon) {
            if (this.outOfChina(gcjLat, gcjLon))
                return {'lat': gcjLat, 'lon': gcjLon};

            var d = this.delta(gcjLat, gcjLon);
            return {'lat': gcjLat - d.lat, 'lon': gcjLon - d.lon};
        },
        //GCJ-02 to WGS-84 exactly
        gcj_decrypt_exact : function (gcjLat, gcjLon) {
            var initDelta = 0.01;
            var threshold = 0.000000001;
            var dLat = initDelta, dLon = initDelta;
            var mLat = gcjLat - dLat, mLon = gcjLon - dLon;
            var pLat = gcjLat + dLat, pLon = gcjLon + dLon;
            var wgsLat, wgsLon, i = 0;
            while (1) {
                wgsLat = (mLat + pLat) / 2;
                wgsLon = (mLon + pLon) / 2;
                var tmp = this.gcj_encrypt(wgsLat, wgsLon);
                dLat = tmp.lat - gcjLat;
                dLon = tmp.lon - gcjLon;
                if ((Math.abs(dLat) < threshold) && (Math.abs(dLon) < threshold))
                    break;

                if (dLat > 0) pLat = wgsLat; else mLat = wgsLat;
                if (dLon > 0) pLon = wgsLon; else mLon = wgsLon;

                if (++i > 10000) break;
            }
            //console.log(i);
            return {'lat': wgsLat, 'lon': wgsLon};
        },
        //GCJ-02 to BD-09
        bd_encrypt : function (gcjLat, gcjLon) {
            var x = gcjLon, y = gcjLat;
            var z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * this.x_pi);
            var theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * this.x_pi);
            var bdLon = z * Math.cos(theta) + 0.0065;
            var bdLat = z * Math.sin(theta) + 0.006;
            return {'lat' : bdLat,'lon' : bdLon};
        },
        //BD-09 to GCJ-02
        bd_decrypt : function (bdLat, bdLon) {
            var x = bdLon - 0.0065, y = bdLat - 0.006;
            var z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * this.x_pi);
            var theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * this.x_pi);
            var gcjLon = z * Math.cos(theta);
            var gcjLat = z * Math.sin(theta);
            return {'lat' : gcjLat, 'lon' : gcjLon};
        },
        //WGS-84 to BD-09
        gcj_bd_encrypt : function (wgsLat, wgsLon) {
            var loc = this.gcj_encrypt(wgsLat, wgsLon);
            return this.bd_encrypt(loc.lat, loc.lon);
        },
        //WGS-84 to Web mercator
        //mercatorLat -> y mercatorLon -> x
        mercator_encrypt : function(wgsLat, wgsLon) {
            var x = wgsLon * 20037508.34 / 180.0;
            var y = Math.log(Math.tan((90.0 + wgsLat) * this.PI / 360.0)) / (this.PI / 180.0);
            y = y * 20037508.34 / 180.0;
            return {'lat' : y, 'lon' : x};
            /*
            if ((Math.abs(wgsLon) > 180 || Math.abs(wgsLat) > 90))
                return null;
            var x = 6378137.0 * wgsLon * 0.017453292519943295;
            var a = wgsLat * 0.017453292519943295;
            var y = 3189068.5 * Math.log((1.0 + Math.sin(a)) / (1.0 - Math.sin(a)));
            return {'lat' : y, 'lon' : x};
            //*/
        },
        // Web mercator to WGS-84
        // mercatorLat -> y mercatorLon -> x
        mercator_decrypt : function(mercatorLat, mercatorLon) {
            var x = mercatorLon / 20037508.34 * 180.0;
            var y = mercatorLat / 20037508.34 * 180.0;
            y = 180 / this.PI * (2 * Math.atan(Math.exp(y * this.PI / 180.0)) - this.PI / 2);
            return {'lat' : y, 'lon' : x};
            /*
            if (Math.abs(mercatorLon) < 180 && Math.abs(mercatorLat) < 90)
                return null;
            if ((Math.abs(mercatorLon) > 20037508.3427892) || (Math.abs(mercatorLat) > 20037508.3427892))
                return null;
            var a = mercatorLon / 6378137.0 * 57.295779513082323;
            var x = a - (Math.floor(((a + 180.0) / 360.0)) * 360.0);
            var y = (1.5707963267948966 - (2.0 * Math.atan(Math.exp((-1.0 * mercatorLat) / 6378137.0)))) * 57.295779513082323;
            return {'lat' : y, 'lon' : x};
            //*/
        },
        // two point's distance
        distance : function (latA, lonA, latB, lonB) {
            var earthR = 6371000.0;
            var x = Math.cos(latA * this.PI / 180.0) * Math.cos(latB * this.PI / 180.0) * Math.cos((lonA - lonB) * this.PI / 180);
            var y = Math.sin(latA * this.PI / 180.0) * Math.sin(latB * this.PI / 180.0);
            var s = x + y;
            if (s > 1) s = 1;
            if (s < -1) s = -1;
            var alpha = Math.acos(s);
            var distance = alpha * earthR;
            return distance;
        },
        outOfChina : function (lat, lon) {
            if (lon < 72.004 || lon > 137.8347)
                return true;
            if (lat < 0.8293 || lat > 55.8271)
                return true;
            return false;
        },
        transformLat : function (x, y) {
            var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
            ret += (20.0 * Math.sin(6.0 * x * this.PI) + 20.0 * Math.sin(2.0 * x * this.PI)) * 2.0 / 3.0;
            ret += (20.0 * Math.sin(y * this.PI) + 40.0 * Math.sin(y / 3.0 * this.PI)) * 2.0 / 3.0;
            ret += (160.0 * Math.sin(y / 12.0 * this.PI) + 320 * Math.sin(y * this.PI / 30.0)) * 2.0 / 3.0;
            return ret;
        },
        transformLon : function (x, y) {
            var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
            ret += (20.0 * Math.sin(6.0 * x * this.PI) + 20.0 * Math.sin(2.0 * x * this.PI)) * 2.0 / 3.0;
            ret += (20.0 * Math.sin(x * this.PI) + 40.0 * Math.sin(x / 3.0 * this.PI)) * 2.0 / 3.0;
            ret += (150.0 * Math.sin(x / 12.0 * this.PI) + 300.0 * Math.sin(x / 30.0 * this.PI)) * 2.0 / 3.0;
            return ret;
        }
    };

    var getBMapPoint = function(lat, lon, projection) {
        if (lat.latitude) {
            projection = lon;
            lon = lat.longitude;
            lat = lat.latitude;
        }
        var loc = {lat: lat, lon: lon};
        if (projection) {
            if (projection.toUpperCase() == 'WGS-84') {
                loc = GPS.gcj_bd_encrypt(loc.lat, loc.lon);
            }
        }
        return new BMap.Point(loc.lon, loc.lat);
    };

    var checkMandatory = function(prop, desc) {
        if (!prop) {
            throw new Error(desc);
        }
    };

    var defaults = function(dest, src) {
        for (var key in src) {
            if (typeof dest[key] === 'undefined') {
                // console.log(dest[key])
                dest[key] = src[key];
            }
        }
    };

    var baiduMapDir = function() {

        // Return configured, directive instance

        return {
            restrict: 'E',
            scope: {
                'options': '='
            },
            link: function($scope, element, attrs) {

                var defaultOpts = {
                    navCtrl: true,
                    scaleCtrl: true,
                    overviewCtrl: true,
                    enableScrollWheelZoom: true,
                    zoom: 10
                };

                var opts = $scope.options;

                defaults(opts, defaultOpts);

                checkMandatory(opts.center, 'options.center must be set');
                checkMandatory(opts.center.longitude, 'options.center.longitude must be set');
                checkMandatory(opts.center.latitude, 'options.center.latitude must be set');
                checkMandatory(opts.city, 'options.city must be set');

                // create map instance
                var map = new BMap.Map(element.find('div')[0]);

                // init map, set central location and zoom level
                map.centerAndZoom(getBMapPoint(opts.center.latitude, opts.center.longitude, opts.projection), opts.zoom);
                if (opts.navCtrl) {
                    // add navigation control
                    map.addControl(new BMap.NavigationControl());
                }
                if (opts.scaleCtrl) {
                    // add scale control
                    map.addControl(new BMap.ScaleControl());
                }
                if (opts.overviewCtrl) {
                    //add overview map control
                    map.addControl(new BMap.OverviewMapControl());
                }
                if (opts.trafficCtrl) {
                    // add traffic control, require include both:
                    // http://api.map.baidu.com/library/TrafficControl/1.4/src/TrafficControl_min.js
                    // http://api.map.baidu.com/library/TrafficControl/1.4/src/TrafficControl_min.css
                    var ctrl = new BMapLib.TrafficControl();
                    map.addControl(ctrl);
                    ctrl.setAnchor(opts.trafficCtrl.anchor ? opts.trafficCtrl.anchor : BMAP_ANCHOR_TOP_RIGHT);
                }
                if (opts.enableScrollWheelZoom) {
                    //enable scroll wheel zoom
                    map.enableScrollWheelZoom();
                }
                // set the city name
                map.setCurrentCity(opts.city);


                if (!opts.markers) {
                    return;
                }
                //create markers

                var previousMarkers = [];
                var previousPoints = [];

                var openInfoWindow = function(infoWin) {
                    return function() {
                        this.openInfoWindow(infoWin);
                    };
                };

                var mark = function() {

                    var i = 0;

                    for (i = 0; i < previousMarkers.length; i++) {
                        previousMarkers[i].removeEventListener('click', openInfoWindow(infoWindow2));
                        map.removeOverlay(previousMarkers[i]);
                    }
                    previousMarkers.length = 0;
                    previousPoints = [];

                    for (i = 0; i < opts.markers.length; i++) {
                        var marker = opts.markers[i];
                        var pt = getBMapPoint(marker.latitude, marker.longitude, opts.projection);
                        previousPoints.push(pt);
                        var marker2;
                        var markerW = 19;
                        var markerH = 25;
                        if (marker.icon) {
                            markerW = marker.icon.width || marker.icon.w || markerW;
                            markerH = marker.icon.height || marker.icon.h || markerH;
                            var iconOptions = {};
                            if (marker.icon.anchor) {
                                iconOptions.anchor = new BMap.Size(marker.icon.anchor.x, marker.icon.anchor.y);
                            }
                            if (marker.icon.imageOffset) {
                                iconOptions.imageOffset = new BMap.Size(marker.icon.imageOffset.x, marker.icon.imageOffset.y);
                            }
                            var icon = new BMap.Icon(marker.icon.url || marker.icon, new BMap.Size(markerW, markerH), iconOptions);
                            marker2 = new BMap.Marker(pt, {
                                icon: icon
                            });
                        } else {
                            marker2 = new BMap.Marker(pt);
                        }

                        if (marker.label) {
                            var labelOffsetX = markerW+1;
                            var labelOffsetY = -10;
                            if (marker.label.offset) {
                                labelOffsetX = marker.label.offset.x;
                                labelOffsetY = marker.label.offset.y;
                            }
                            var label = new BMap.Label(marker.label.content || marker.label, {
                                offset: new BMap.Size(labelOffsetX, labelOffsetY)
                            });
                            marker2.setLabel(label);
                        }
                        // add marker to the map
                        map.addOverlay(marker2);
                        previousMarkers.push(marker2);

                        if (!marker.title && !marker.content) {
                            return;
                        }
                        var infoWindow2 = new BMap.InfoWindow('<p>' + (marker.title ? marker.title : '') + '</p><p>' + (marker.content ? marker.content : '') + '</p>', {
                            enableMessage: !!marker.enableMessage
                        });
                        marker2.addEventListener('click', openInfoWindow(infoWindow2));
                    }
                };

                mark();

                $scope.$watch('options.center', function(newValue, oldValue) {
                    opts = $scope.options;
                    map.panTo(getBMapPoint(opts.center.latitude, opts.center.longitude, opts.projection));
                }, true);

                $scope.$watch('options.zoom', function(newValue, oldValue) {
                    map.setZoom($scope.options.zoom);
                }, true);

                $scope.$watch('options.markers', function(newValue, oldValue) {
                    mark();
                }, true);

                $scope.$watch('options.viewport', function(newValue, oldValue) {
                    if (newValue) {
                        opts = $scope.options;
                        var viewPort = map.getViewport(previousPoints, newValue || {});
                        map.centerAndZoom(viewPort.center, viewPort.zoom);
                    }
                }, true);

            },
            template: '<div style="width: 100%; height: 100%;"></div>'
        };
    };

    var baiduMap = angular.module('baiduMap', []);
    baiduMap.directive('baiduMap', [baiduMapDir]);
}));