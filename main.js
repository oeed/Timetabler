let possibleCourses = ["1228402", "1228559", "1228561", "1228563", "1228564", "1228566", "1228569"]
let streams = {}
let streamCombinations = {} // the officiall sanctioned combinations (i.e. always going to the same lecture time)
let breakdownable = {
	"LEC": true
}

let coursesTypesSlots = {}

function retrieveNREUM() {
	var scriptContent = "$('body').attr('tmp_NREUM', NREUM.loader_config.xpid);"

	var script = document.createElement('script')
	script.id = 'tmpScript'
	script.appendChild(document.createTextNode(scriptContent));
	(document.body || document.head || document.documentElement).appendChild(script)

	var nreum = $("body").attr("tmp_NREUM")
	$("body").removeAttr("tmp_NREUM")
	$("#tmpScript").remove()
	return nreum
}

var NREUM = retrieveNREUM()


function k_combinations(set, k) {
	var i, j, combs, head, tailcombs;

	// There is no way to take e.g. sets of 5 elements from
	// a set of 4.
	if (k > set.length || k <= 0) {
		return [];
	}

	// K-sized set has only one K-sized subset.
	if (k == set.length) {
		return [set];
	}

	// There is N 1-sized subsets in a N-sized set.
	if (k == 1) {
		combs = [];
		for (i = 0; i < set.length; i++) {
			combs.push([set[i]]);
		}
		return combs;
	}

	combs = [];
	for (i = 0; i < set.length - k + 1; i++) {
		// head is a list that includes only our current element.
		head = set.slice(i, i + 1);
		// We take smaller combinations from the subsequent elements
		tailcombs = k_combinations(set.slice(i + 1), k - 1);
		// For each (k-1)-combination we join it with the current
		// and store it to the set of k-combinations.
		for (j = 0; j < tailcombs.length; j++) {
			combs.push(head.concat(tailcombs[j]));
		}
	}
	return combs;
}

function combinations(set, reqLength) {
	var k, i, combs, k_combs;
	combs = [];

	// Calculate all non-empty k-combinations
	for (k = 1; k <= set.length; k++) {
		k_combs = k_combinations(set, k);
		for (i = 0; i < k_combs.length; i++) {
			if (k_combs[i].length == reqLength)
				combs.push(k_combs[i]);
		}
	}
	return combs;
}

function generate(courses) {
	return new Promise((resolve, reject) => {
		$.ajax({
			type: "POST",
			url: "https://auckland.collegescheduler.com/api/terms/2018%20Semester%20One/schedules/generate",
			// The key needs to match your method's input parameter (case-sensitive).
			data: JSON.stringify({
				"currentSections": [],
				"term": "2018 Semester One",
				"courses": courses,
				"breaks": [],
				"cartSections": [],
				"padding": 0
			}),
			contentType: "application/json",
			dataType: "json",
			headers: {
				"X-NewRelic-ID": NREUM,
				"X-XSRF-Token": $("input[name='__RequestVerificationToken']").val()
			},
			success: function(data) {
				resolve(data)
			},
			failure: function(errMsg) {
				reject(errMsg)
			}
		})
	})
}

function cached(id) {
	return new Promise((resolve, reject) => {
		$.getJSON("http://localhost:8888/" + id + ".json", function(data) {
			resolve(data)
		})
	})
}

function loadCourse(id) {
	return new Promise(async(resolve, reject) => {
		let data = await cached([id])

		// First get all of the possible tutorials and lecture streams
		for (let stream of data.sections)
			streams[stream.id] = stream

		// Then get all of the stream combinations
		let combinations = []
		for (let stream of data.registrationBlocks)
			combinations.push(stream.sectionIds)
		streamCombinations[id] = combinations

		// Now get all of the slots, basically streams but lectures are broken down in to induvidual days.
		// Slots are arrays of the required classes. A lecture will be an array of that one lecture, but a class with multiple tutorials per stream will not break them up

		// First we populate the base slot, they aren't breakdown yet
		let slotTypes = {} // slots are first seprated down in to types (i.e. LEC, TUT)
		for (let stream of data.sections) {
			if (!slotTypes[stream.component])
				slotTypes[stream.component] = []

			// There is only one initial slot per stream, the base combination (i.e. lectures all at the one time)
			let slot = []
			let existing = {} // prevent double ups (for different halves of semester)
			for (let meeting of stream.meetings) {
				let clashKey = meeting.days + ":" + meeting.startTime + ":" + meeting.endTime
				if (existing[clashKey])
					continue

				slot.push({
					stream: stream.id,
					day: meeting.days,
					start: meeting.startTime,
					end: meeting.endTime
				})
				existing[clashKey] = true
			}

			// Add that one slot to the list of slots
			slotTypes[stream.component].push(slot)
		}

		// Now breakdown lectures, adding slots for each possible combination
		let courseSlots = []
		for (let type in slotTypes) {
			let canBreakdown = breakdownable[type] == true
			let slots = slotTypes[type]
			if (!canBreakdown) {
				courseSlots.push(slots)
				continue
			}


			// First, lets make a list of all the days that can have different times
			// We also make sure that each slot has the same number of times
			let days = []
			let dayCount = false
			for (let slot of slots) {
				if (dayCount != false && slot.length != dayCount)
					return reject("Different lecture count for " + id)

				if (dayCount == false)
					for (let time of slot)
						days.push(time.day)

				dayCount = slot.length
			}

			let newSlots = []
			for (var i = 0; i < Math.pow(slots.length, dayCount); i++) {
				let slot = []
				for (var day = 0; day < dayCount; day++) { // the day that is being added to the possible slot
					let timeSlot = Math.floor((i / Math.pow(slots.length, day))) % slots.length // Select the slot we're using for this day
					slot.push(slots[timeSlot][day])
				}
				newSlots.push(slot)
			}
			courseSlots.push(newSlots)
		}

		// We now have generated all the possible slots for this course, store them
		coursesTypesSlots[id] = courseSlots
		resolve()
	})
}

(async function() {
	// let promises = []
	// for (let id of possibleCourses)
	// 	promises.append(loadCourse(id))

	let cs = ["1229761", "1228564", "1228559", "1228563"] //["1230234", "1229761", "1228402"]
	let promises = []
	for (let id of cs)
		promises.push(loadCourse(id))
	await Promise.all(promises)

	// We've now got all our possible slots, find potential timetables
	let courseCount = 2
	let possibleCourseCombinations = combinations(cs, courseCount) // litterally every possible combination of courses
	let validTimetables = []
	for (let possibleCombination of possibleCourseCombinations) {
		// We combine the separate course specific slot arrays of arrays in to one (we basically treat it as one big course, where each type of lecture/tut must be taken)
		let combinedSlots = []
		for (let id of possibleCombination)
			for (let typeSlots of coursesTypesSlots[id])
				combinedSlots.push(typeSlots)
		let maxSlots = 1 // the maximum number of possible combinations of various times (i.e. max possible slots, but each slot will have n many times in it)
		for (let slots of combinedSlots)
			maxSlots *= slots.length



		// Now work out every possible timetable for this combination of courses
		let possibleTimetables = []
		for (var i = 0; i < maxSlots; i++) {
			let slot = []
			for (let n in combinedSlots) {
				let slots = combinedSlots[n]
				let timeSlot = i % slots.length
				slot.push(slots[timeSlot])
			}
			possibleTimetables.push(slot)
		}
		// console.log(possibleTimetables)

		// We have all the possible combinations, remove any combinations that have clashes
		eachTimetable: for (let timetable of possibleTimetables) {
			let allocatedDaysTimes = {}
				// Go through each course's class types (i.e. lecture, lab, etc.)
			for (let courseType of timetable) {
				// Go through each time allocated to each class type
				for (let time of courseType) {
					if (!allocatedDaysTimes[time.day])
						allocatedDaysTimes[time.day] = {}
					for (var t = time.start; t < time.end; t += 100) { // loop from start hour to end hour, adding an hour each time
						if (!allocatedDaysTimes[time.day][t])
							allocatedDaysTimes[time.day][t] = true
						else {
							// Clash!
							// This timetable is useless, next timetable
							continue eachTimetable
						}
					}
				}
			}

			// If we've reached here this is valid, non-clashing timetable
			validTimetables.push(timetable)
		}
	}

	// Now we have all our valid timetables.
	// Lets go through each timetable
})()