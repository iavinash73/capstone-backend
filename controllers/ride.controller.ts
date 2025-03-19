import { Request, Response } from "express";
import { validationResult } from "express-validator";
import { captainModel, rideModel, userModel } from "../models";
import {
  fareCalculator,
  formatDuration,
  getCaptainInTheRadius,
  getDistanceTimeOSRM,
  getGeocodeCoordinatesByAddress,
  otpGenerator,
} from "../services";
import { sendMessageToSocketId } from "../socket";

const createRide = async (req: Request, res: Response): Promise<void> => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
  }

  const { origin, destination, vehicleType } = req.body;

  // console.log(req.body);

  try {
    // Ensure userId is set by the authentication middleware
    const userId = req.userId; // User ID from auth middleware

    if (!userId) {
      res.status(400).json({ message: "User ID is missing" });
    }

    const originCoordinate = await getGeocodeCoordinatesByAddress(origin);
    const destinationCoordinate = await getGeocodeCoordinatesByAddress(
      destination
    );

    //  Calculate distance and time between origin and destination
    const { distance, duration } = await getDistanceTimeOSRM(
      originCoordinate,
      destinationCoordinate
    );

    // Calculate fare for the ride
    const fare = fareCalculator(distance, duration, vehicleType);

    // Create the ride record
    const ride = await rideModel.create({
      userId,
      origin,
      destination,
      fare,
      otp: otpGenerator(6),
      vehicleType,
    });

    const formattedDuration = formatDuration(duration);

    // Send response with the ride data
    res.status(201).json({
      message: "Ride created successfully",
      fare,
      ride,
      distance,
      duration,
      formattedDuration: formattedDuration,
    });

    // Logics for getting Captains in the specific Radius

    const captainsInRadious = await getCaptainInTheRadius(
      originCoordinate.lat,
      originCoordinate.lng,
      10
    );

    const rideWithoutOtp = ride.toObject();
    delete rideWithoutOtp.otp;

    const rideWithUser = await rideModel
      .findOne({ _id: ride.id })
      .populate("userId")
      .setOptions({ strictPopulate: false });

    // console.log(rideWithUser);

    captainsInRadious.map((captain) => {
      // console.log(captain, rideWithoutOtp);

      const captainSocketId = captain.socketId!;

      sendMessageToSocketId(captainSocketId, {
        event: "new-ride",
        data: {
          rideWithUser,
          distance,
          duration,
          formattedDuration,
        },
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getFare = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
  }

  const { origin, destination } = req.query;

  try {
    const originCoordinate = await getGeocodeCoordinatesByAddress(
      origin as string
    );

    const destinationCoordinate = await getGeocodeCoordinatesByAddress(
      destination as string
    );

    //  Calculate distance and time between origin and destination
    const { distance, duration } = await getDistanceTimeOSRM(
      originCoordinate,
      destinationCoordinate
    );

    const formattedDuration = formatDuration(duration);

    // Calculate fare for the ride
    const fare = fareCalculator(distance, duration);

    res.status(200).json({
      message: "Fare calculated successfully",
      fare,
      distance,
      duration,
      formattedDuration,
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

const confirmRideByCaptain = async (
  req: Request,
  res: Response
): Promise<void> => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
  }

  const { rideId, captainId } = req.body;

  try {
    if (!rideId) {
      res.status(400).json({ message: "Ride ID is missing" });
      return;
    }

    await rideModel.findByIdAndUpdate(
      rideId,
      { status: "accepted", captainId: captainId },
      { new: true }
    );

    const updatedRide = await rideModel.findById(rideId);

    const userId = updatedRide?.userId?._id.toString() || "";

    const rideUser = await userModel.findById(userId).select("-password");

    const userSocketId = rideUser?.socketId || "";

    const captain = await captainModel.findById(captainId).select("-password");

    sendMessageToSocketId(userSocketId, {
      event: "confirm-ride-by-captain",
      data: {
        updatedRide,
        captain,
        rideUser,
      },
    });

    if (!updatedRide) {
      res.status(404).json({ message: "Ride not found" });
      return;
    }

    res.status(200).json({
      message: "Ride confirmed successfully",
      updatedRide,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const startRide = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
  }

  const { otp, rideId } = req.body;

  console.log(rideId, otp);

  if (!rideId) {
    res.status(400).json({ message: "Ride ID is missing" });
    return;
  }

  if (!otp) {
    res.status(400).json({ message: "OTP is missing" });
    return;
  }

  try {
    const ride = await rideModel.findById(rideId);

    if (!ride) {
      res.status(404).json({ message: "Ride not found" });
      return;
    }

    const matchedOtp = ride.otp === otp;

    if (!matchedOtp) {
      res.status(400).json({ message: "Invalid OTP" });
      return;
    }

    if (matchedOtp) {
      await rideModel.findByIdAndUpdate(
        rideId,
        { status: "onGoing" },
        { new: true }
      );
    }

    const userId = ride?.userId?._id.toString() || "";

    const rideUser = await userModel.findById(userId).select("-password");

    const userSocketId = rideUser?.socketId || "";

    console.log(userSocketId);

    sendMessageToSocketId(userSocketId, {
      event: "ride-started",
      data: {
        ride,
        rideUser,
      },
    });

    res
      .status(200)
      .json({ message: "Ride started successfully", ride, rideUser });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const completeRide = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
  }

  const { rideId } = req.body;

  console.log(rideId);

  if (!rideId) {
    res.status(400).json({ message: "Ride ID is missing" });
    return;
  }

  try {
    await rideModel.findByIdAndUpdate(
      rideId,
      {
        status: "completed",
        captainId: req.captainId,
      },
      { new: true }
    );

    const ride = await rideModel.findById(rideId);

    const userId = ride?.userId?._id.toString() || "";

    const rideUser = await userModel.findById(userId).select("-password");

    const userSocketId = rideUser?.socketId || "";

    sendMessageToSocketId(userSocketId, {
      event: "ride-completed",
      data: {
        ride,
        rideUser,
        messageNotification: "Ride Completed!",
      },
    });

    res
      .status(200)
      .json({ message: "Ride Completed!", ride, rideUser });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export default {
  createRide,
  getFare,
  confirmRideByCaptain,
  startRide,
  completeRide,
};
