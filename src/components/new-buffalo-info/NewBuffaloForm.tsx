import { SubmitHandler, useForm } from "react-hook-form";
import { useBuffaloInfo } from "~/context/buffalo-info.context";
import { api } from "~/utils/api";

export type NewBuffaloInput = {
  tokenId?: number;
  name: string;
  microchip: string;
  certNo?: string;
  origin: string;
  color: string;
  // image: FileList;
  detail?: string | null;
  sex: string;
  rarity: string;
  birthday: Date;
  height: number;
  motherId?: string | null;
  fatherId?: string | null;
};

const NewBuffaloForm = () => {
  const { saveBuffaloInput } = useBuffaloInfo();
  const { register, handleSubmit, reset, watch } = useForm<NewBuffaloInput>();
  const { data: currentTokenId } = api.metadata.getCurrentTokenId.useQuery();

  const onSubmit: SubmitHandler<NewBuffaloInput> = async (data, event) => {
    event?.preventDefault();
    if (!currentTokenId) {
      alert("cannot load metadata!");
      return;
    }
    saveBuffaloInput({
      ...data,
      height: +data.height,
      birthday: new Date(data.birthday),
      tokenId: currentTokenId,
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid grid-cols-1 gap-2 p-2"
    >
      <div className="form-control">
        <label className="label label-text">Current TokenId</label>
        <input
          className="input input-bordered bg-neutral"
          type="number"
          readOnly
          placeholder={currentTokenId?.toString()}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="text"
          placeholder="Buffalo Name"
          {...register("name", { required: true })}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="text"
          placeholder="Buffalo Microchip"
          {...register("microchip", { required: true })}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="text"
          placeholder="Cert No."
          {...register("certNo")}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="text"
          placeholder="Origin"
          {...register("origin", { required: true })}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="number"
          min={0}
          placeholder="Height"
          {...register("height", { required: true })}
        />
      </div>

      <div className="form-control">
        <select
          className="select select-bordered"
          defaultValue="na"
          {...register("color", { required: true })}
        >
          <option disabled value="na">
            Select Color
          </option>
          <option value="Black">Black</option>
          <option value="Albino">Albino</option>
        </select>
      </div>

      <div className="form-control">
        <select
          className="select select-bordered"
          defaultValue="na"
          {...register("sex", { required: true })}
        >
          <option disabled value="na">
            Select Gender
          </option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
      </div>

      <div className="form-control">
        <select
          className="select select-bordered"
          defaultValue="na"
          {...register("rarity", { required: true })}
        >
          <option value="na" disabled>
            Select Rarity
          </option>
          <option value="Normal">Normal</option>
          <option value="Rare">Rare</option>
          <option value="Super Rare">Super Rare</option>
          <option value="Super Special Rare">Super Special Rare</option>
        </select>
      </div>

      <div className="form-control">
        <label className="label label-text">birthdate</label>
        <input
          className="input input-bordered"
          type="date"
          placeholder="Birthdate"
          {...register("birthday", { required: true })}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="text"
          placeholder="fartherId (optional)"
          {...register("fatherId")}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="text"
          placeholder="mothoerId (optional)"
          {...register("motherId")}
        />
      </div>

      <div className="form-control">
        <input
          className="input input-bordered"
          type="text"
          placeholder="Detail"
          {...register("detail")}
        />
      </div>

      <p className="text-xs text-warning">
        Please check information before submit
      </p>
      <div className="flex justify-center gap-2">
        <button className="btn btn-primary" type="submit">
          Submit
        </button>
        <button className="btn btn-warning" type="reset">
          Reset
        </button>
      </div>
    </form>
  );
};

export default NewBuffaloForm;
