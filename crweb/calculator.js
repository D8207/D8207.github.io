// https://raw.githubusercontent.com/andrewhayward/dijkstra/master/graph.js
importScripts( 'graph.js' );

var distance = function( stations, station1, station2 ) {
	var x1 = stations[station1][5];
	var x2 = stations[station2][5];
	var y1 = stations[station1][6];
	var y2 = stations[station2][6];
	var x = x1 - x2, y = y1 - y2
	return Math.floor( Math.sqrt( x * x + y * y ) );
};

var annotatePath = function( stations, wayPoints ) {
	var result = [], prev = null, sum = 0;
	wayPoints.forEach( function( curr ) {
		if ( prev !== null ) {
			var dist = distance( stations, prev, curr );
			result.push( dist );
			sum += dist;
		}
		prev = curr;
	} );
	result.push( sum );
	return result;
};

var buildPath = function( train, stations, useStations, wayPoints ) {
	var map = {};
	useStations.forEach( function( i ) {
		if ( stations[i][4] < train.stars ) {
			return;
		}
		map[i] = {};

		useStations.forEach( function( j ) {
			if ( i === j ) {
				return;
			}

			if ( stations[j][4] < train.stars ) {
				return;
			}

			var dist = distance( stations, i, j );
			if ( dist > train.distance ) {
				return;
			}

			map[i][j] = dist;
		} );
	} );

	var graph = new Graph( map );
	var result = [], prev = null;

	wayPoints.forEach( function( curr ) {
		if ( result === null ) {
			return;
		}
		if ( prev !== null ) {
			var path = graph.findShortestPath( prev, curr );
			if ( path === null ) {
				result = null;
			} else {
				result.pop();
				result = result.concat( path );
			}
		}
		prev = curr;
	} );

	return result;
};

/**
 * @param Object train { speed, distance, weight, battery, stars, loads }
 * @param Object stations the global station data object
 * @param Array useStations
 * @param Array wayPoints
 * @param Boolean insert
 * @return Object { ok, message }
 */
var calculate = function( train, stations, useStations, wayPoints, insert ) {
	// Sanity check
	if ( wayPoints.length < 2 ) {
		return {
			ok: false,
			message: '没有指定足够的车站'
		};
	}

	// Check whether the train can go to all specified stations.
	var result = null;
	wayPoints.forEach( function( curr ) {
		if ( stations[curr][4] < train.stars ) {
			result = {
				ok: false,
				message: '此车无法到达所有指定的车站'
			};
		}
	} );
	if ( result ) {
		return result;
	}

	var path, totalDistance;
	if ( insert ) {
		// Build a path from given wayPoints.
		path = buildPath( train, stations, useStations, wayPoints );
		if ( path ) {
			totalDistance = annotatePath( stations, path ).pop();
		} else {
			return {
				ok: false,
				message: '由于距离限制，此车找不到可以行走的径路'
			};
		}
	} else {
		// Check whether the train can go across all gaps.
		var distances = annotatePath( stations, wayPoints );
		totalDistance = distances.pop();
		distances.forEach( function( curr ) {
			if ( curr > train.distance ) {
				result = {
					ok: false,
					message: '由于距离限制，此车无法沿指定的径路行走'
				};
			}
		} );
		if ( result ) {
			return result;
		}
		path = wayPoints;
	}

	var runningTime = Math.floor( totalDistance * 450 / train.speed ); // In seconds
	var batteryConsumed = Math.floor( runningTime / 60 );
	var fromStation = wayPoints[0], toStation = wayPoints[wayPoints.length - 1];
	var priceDistance = distance( stations, fromStation, toStation );
	var priceCoins = priceDistance + 50;
	var costCoins = Math.floor( train.speed * train.weight * totalDistance / 400000 );
	var totalGross = train.loads < 0 ? NaN : ( train.loads * Math.floor( priceCoins * ( train.loads > 1 ? 1.25 : 1 ) ) );
	var totalNet = train.loads < 0 ? NaN : ( totalGross - costCoins );
	var dailyCount = Math.floor( train.battery / batteryConsumed );
	var dailyRemaining = train.battery - dailyCount * batteryConsumed;
	var dailyGross = totalGross * dailyCount;
	var dailyNet = totalNet * dailyCount;

	return {
		ok: true,
		path: path,
		totalDistance: totalDistance,
		runningTime: runningTime,
		batteryConsumed: batteryConsumed,
		priceDistance: priceDistance,
		priceCoins: priceCoins,
		pricePoints: Math.floor( priceDistance / 500 ),
		costCoins: costCoins,
		totalGross: totalGross,
		totalNet: totalNet,
		dailyCount: dailyCount,
		dailyRemaining: dailyRemaining,
		dailyGross: dailyGross,
		dailyNet: dailyNet
	};
};

onmessage = function( e ) {
	var calculated = calculate.apply( this, e.data );
	postMessage( calculated );
};
