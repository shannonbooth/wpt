// META: script=/resources/test-only-api.js
// META: script=resources/pressure-helpers.js
// META: global=window,dedicatedworker,sharedworker

'use strict';

pressure_test(async (t, mockPressureService) => {
  const readings = ['nominal', 'fair', 'serious', 'critical'];

  const sampleInterval = 250;
  const pressureChanges = await new Promise(async resolve => {
    const observerChanges = [];
    const observer = new PressureObserver(changes => {
      observerChanges.push(changes);
    }, {sampleInterval});
    observer.observe('cpu');

    mockPressureService.startPlatformCollector(sampleInterval / 2);
    let i = 0;
    // mockPressureService.updatesDelivered() does not necessarily match
    // pressureChanges.length, as system load and browser optimizations can
    // cause the actual timer used by mockPressureService to deliver readings
    // to be a bit slower or faster than requested.
    while (observerChanges.length < 4) {
      mockPressureService.setPressureUpdate(
          'cpu', readings[i++ % readings.length]);
      await t.step_wait(
          () => mockPressureService.updatesDelivered() >= i,
          `At least ${i} readings have been delivered`);
    }
    observer.disconnect();
    resolve(observerChanges);
  });

  assert_equals(pressureChanges.length, 4);
  assert_greater_than_equal(
      pressureChanges[1][0].time - pressureChanges[0][0].time, sampleInterval);
  assert_greater_than_equal(
      pressureChanges[2][0].time - pressureChanges[1][0].time, sampleInterval);
  assert_greater_than_equal(
      pressureChanges[3][0].time - pressureChanges[2][0].time, sampleInterval);
}, 'Faster collector: Timestamp difference between two changes should be higher or equal to the observer sample rate');

pressure_test(async (t, mockPressureService) => {
  const pressureChanges = [];
  const sampleInterval = 1000;
  const observer = new PressureObserver(changes => {
    pressureChanges.push(changes);
  }, {sampleInterval});

  await new Promise(async resolve => {
    observer.observe('cpu');
    mockPressureService.setPressureUpdate('cpu', 'critical');
    mockPressureService.startPlatformCollector(sampleInterval);
    await t.step_wait(() => pressureChanges.length == 1);
    observer.disconnect();
    resolve();
  });

  await new Promise(async resolve => {
    observer.observe('cpu');
    mockPressureService.setPressureUpdate('cpu', 'serious');
    mockPressureService.startPlatformCollector(sampleInterval / 4);
    await t.step_wait(() => pressureChanges.length == 2);
    observer.disconnect();
    resolve();
  });

  assert_equals(pressureChanges.length, 2);
  // When disconnect() is called, PressureRecord in [[LastRecordMap]] for cpu
  // should be deleted. So the second PressureRecord is not discarded even
  // though the time interval does not meet the requirement.
  assert_less_than(
      pressureChanges[1][0].time - pressureChanges[0][0].time, sampleInterval);
}, 'disconnect() should update [[LastRecordMap]]');