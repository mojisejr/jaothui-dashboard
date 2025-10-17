import React, { useEffect } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { useAuth } from "~/context/auth.context";

type LoginType = {
  username: string;
  password: string;
};

const LoginForm = () => {
  const { register, handleSubmit, reset } = useForm<LoginType>();
  const { login, isPending, isError } = useAuth();

  useEffect(() => {
    if (isError) {
      reset();
    }
  }, [isError]);

  const onSubmit: SubmitHandler<LoginType> = async (data, event) => {
    event?.preventDefault();
    login(data.username, data.password);
  };

  return (
    <>
      <form
        className="grid grid-cols-1 gap-2"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div>
          <input
            type="text"
            className="input input-bordered"
            placeholder="username"
            {...register("username", { required: true })}
          />
        </div>
        <div>
          <input
            type="password"
            className="input input-bordered"
            placeholder="password"
            {...register("password", { required: true })}
          />
        </div>
        <button disabled={isPending} className="btn btn-primary">
          {isPending ? "Loading .." : "Login"}
        </button>
      </form>
    </>
  );
};

export default LoginForm;
