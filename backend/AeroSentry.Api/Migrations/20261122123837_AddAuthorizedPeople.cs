using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122123837_AddAuthorizedPeople : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<double>(
            name: "RecognitionScore",
            table: "Alerts",
            type: "float",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "RecognizedPersonCategory",
            table: "Alerts",
            type: "nvarchar(20)",
            maxLength: 20,
            nullable: true);

        migrationBuilder.AddColumn<Guid>(
            name: "RecognizedPersonId",
            table: "Alerts",
            type: "uniqueidentifier",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "RecognizedPersonName",
            table: "Alerts",
            type: "nvarchar(100)",
            maxLength: 100,
            nullable: true);

        migrationBuilder.CreateTable(
            name: "AuthorizedPeople",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PropertyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                Phone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                Category = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                ValidUntil = table.Column<DateOnly>(type: "date", nullable: true),
                AccessDisabled = table.Column<bool>(type: "bit", nullable: false),
                Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                EnrolledAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                MeanEmbedding = table.Column<byte[]>(type: "varbinary(max)", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_AuthorizedPeople", x => x.Id);
                table.ForeignKey(
                    name: "FK_AuthorizedPeople_Properties_PropertyId",
                    column: x => x.PropertyId,
                    principalTable: "Properties",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "PersonPhotos",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Angle = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                ContentType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                Image = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                Embedding = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                FaceWidth = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PersonPhotos", x => x.Id);
                table.ForeignKey(
                    name: "FK_PersonPhotos_AuthorizedPeople_PersonId",
                    column: x => x.PersonId,
                    principalTable: "AuthorizedPeople",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_AuthorizedPeople_PropertyId",
            table: "AuthorizedPeople",
            column: "PropertyId");

        migrationBuilder.CreateIndex(
            name: "IX_PersonPhotos_PersonId_Angle",
            table: "PersonPhotos",
            columns: new[] { "PersonId", "Angle" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "PersonPhotos");

        migrationBuilder.DropTable(
            name: "AuthorizedPeople");

        migrationBuilder.DropColumn(
            name: "RecognitionScore",
            table: "Alerts");

        migrationBuilder.DropColumn(
            name: "RecognizedPersonCategory",
            table: "Alerts");

        migrationBuilder.DropColumn(
            name: "RecognizedPersonId",
            table: "Alerts");

        migrationBuilder.DropColumn(
            name: "RecognizedPersonName",
            table: "Alerts");
    }
}
