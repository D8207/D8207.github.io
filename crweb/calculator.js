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

var buildPath = function( train, stations, useStations, wayPoints, penalty ) {
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

			map[i][j] = dist + penalty;
		} );
	} );

	var graph = new Graph( map );
	// findShortestPath emptys the array passed in
	return graph.findShortestPath( wayPoints.slice( 0 ) );
};

/**
 * @param Object train { speed, distance, weight, battery, stars, loads }
 * @param Object stations the global station data object
 * @param Array useStations
 * @param Array wayPoints
 * @param Boolean insert
 * @param Integer penalty
 * @param Float incomeCoef
 * @return Object { ok, message }
 */
var calculate = function( train, stations, useStations, wayPoints, insert, penalty, incomeCoef, night ) {
	var path, totalDistance, distances, priceDistance;

	if ( !incomeCoef ) {
		incomeCoef = 1; // legacy call
	}

	if ( wayPoints.length < 2 ) {
		// Calculate "ideal" profit now.
		path = distances = null;
		totalDistance = priceDistance = Math.floor( train.battery * 60 * train.speed / 450 );
	} else {
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

		if ( insert ) {
			// Build a path from given wayPoints.
			path = buildPath( train, stations, useStations, wayPoints, penalty );
			if ( path ) {
				distances = annotatePath( stations, path );
				totalDistance = distances.pop();
			} else {
				return {
					ok: false,
					message: '由于距离限制，此车找不到可以行走的径路'
				};
			}
		} else {
			// Check whether the train can go across all gaps.
			distances = annotatePath( stations, wayPoints );
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

		var fromStation = wayPoints[0], toStation = wayPoints[wayPoints.length - 1];
		priceDistance = distance( stations, fromStation, toStation );
	}

	var runningTime = Math.floor( totalDistance * 450 / train.speed ); // In seconds
	var batteryConsumed = Math.max( 1, Math.floor( runningTime / 60 ) );
	var priceCoins = priceDistance + 50;
	var costCoins = Math.floor( train.speed * train.weight * totalDistance / 400000 ) + 1;
	// real total gross income is NOT the sum of all prices labeled due to rounding issues
	var totalGross = train.loads < 0 ? NaN : Math.floor(
		Math.floor( train.loads * priceCoins * ( train.loads > 1 ? 1.25 : 1 ) ) * incomeCoef
	);
	var totalNet = train.loads < 0 ? NaN : ( totalGross - costCoins );
	var dailyCount = Math.floor( train.battery / batteryConsumed );
	var dailyRemaining = train.battery - dailyCount * batteryConsumed;
	var dailyGross = totalGross * dailyCount;
	var dailyNet = totalNet * dailyCount;
	if ( night ) {
		dailyNet += costCoins;
	}

	return {
		ok: true,
		path: path,
		distances: distances,
		totalDistance: totalDistance,
		runningTime: runningTime,
		batteryConsumed: batteryConsumed,
		accelerationCost: Math.floor( costCoins / 400 ) + 1,
		priceDistance: priceDistance,
		priceCoins: priceCoins,
		pricePoints: Math.floor( priceDistance / 500 ) + 1,
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
