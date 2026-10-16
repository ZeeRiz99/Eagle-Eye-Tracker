/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('users', {
    school_name: { type: 'text' },
    school_start_time: { type: 'time' },
    school_end_time: { type: 'time' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('users', ['school_name', 'school_start_time', 'school_end_time']);
};
