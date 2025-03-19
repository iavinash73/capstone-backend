import { body } from "express-validator";

const captainRegisterValidation = [
  body("email").isEmail().withMessage("Invalid Email!"),
  body("fullName.firstName")
    .isLength({ min: 3 })
    .withMessage("First name must be atleast 3 characters long!"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password should be at least 6 characters!"),
  body("vehicle.color")
    .isLength({ min: 3 })
    .withMessage("Color should be at least 3 characters!"),
  body("vehicle.plate")
    .isLength({ min: 3 })
    .withMessage("Vehicle plate should be at least 3 characters!"),
  body("vehicle.capacity")
    .isInt({ min: 1 })
    .withMessage("Vehicle capacity must be at least 1!"),
  body("vehicle.vehicleType")
    .isIn(["car", "bike", "auto", "motorcycle"])
    .withMessage("Vehicle type must be one of: car, bike, auto, or motorcycle"),
];

export default captainRegisterValidation;
