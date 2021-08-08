import { Request, Response } from "express";
import Bcrypt from "bcrypt";

import { v4 as uuid } from "uuid";
import generateToken from "src/utils/helpers/GenerateToken";

import { AlreadyExists, NotFound, WrongPassword } from "@errors/Authentication";
import { DefaultError, MissingArguments } from "@errors/GlobalRequest";
import { NotSend } from "@errors/Services";

import User from "@models/User";
import IBody from "@interfaces/IBody";
import Transporter from "src/services/mail";

const AuthenticationController = {
  async SignUp(req: Request, res: Response) {
    const { username, email, password } = req.body as IBody;
    email.toLowerCase();

    if (!(username || email || password)) {
      return res.status(400).send({ message: MissingArguments });
    }

    try {
      if (await User.findOne({ email })) {
        return res.status(400).send({ message: AlreadyExists });
      }

      let user = await new User({
        _id: uuid(),
        email,
        username,
        password,
        createAt: new Date(),
      });

      await user.save();

      user.password = undefined;

      return res.status(200).send({
        authentication: {
          user,
          token: generateToken({ _id: user._id }),
        },
      });
    } catch (error) {
      return res.status(400).send({ message: DefaultError });
    }
  },
  async SignIn(req: Request, res: Response) {
    const { email, password } = req.body as IBody;
    email.toLowerCase();

    if (!(email || password)) {
      return res.status(400).send({ message: MissingArguments });
    }

    try {
      const user = await User.findOne({ email }).select(["+password", "-__v"]);

      if (!user) {
        return res.status(404).send({ message: NotFound });
      }

      if (!(await Bcrypt.compare(password, user.password!))) {
        return res.status(400).json({ message: WrongPassword });
      }

      user.password = undefined;

      return res.status(200).send({
        authentication: {
          user,
          token: generateToken({ _id: user._id }),
        },
      });
    } catch (error) {
      return res.status(400).send({ message: DefaultError });
    }
  },
  async RecoverPassword(req: Request, res: Response) {
    const { email } = req.body as IBody;
    email.toLowerCase();

    if (!email) {
      return res.status(400).send({ message: MissingArguments });
    }

    try {
      const user = await User.findOne({ email }).select([
        "+resetToken",
        "+expireToken",
      ]);

      if (!user) {
        return res.status(404).send({ message: NotFound });
      }

      let resetToken: string = "";
      let expireToken: Date = new Date();
      expireToken.setHours(expireToken.getHours() + 1);

      for (let i = 0; i < 6; i++) {
        let Random = Math.floor(Math.random() * 9).toString();
        resetToken += Random;
      }
      const config = {
        to: email,
        subject: "Minhas tarefas - Recuperação de conta",
        template: "/auth/forgot_password",
        context: { resetToken },
      };

      user.resetToken = resetToken;
      user.expireToken = expireToken;

      await user.save();

      user.resetToken = undefined;
      user.expireToken = undefined;

      await Transporter.sendMail(config, (error) => {
        if (error) {
          return res.status(400).send({ message: NotSend });
        }
      });

      return res.sendStatus(204);
    } catch (error) {
      return res.status(400).send({ message: DefaultError });
    }
  },
};

export default AuthenticationController;
